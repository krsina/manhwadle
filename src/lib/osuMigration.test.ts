import { describe, expect, it } from 'vitest'
import {
  BROWSER_MIRRORS,
  OsuMigrationEngine,
  idFromFileName,
  parseIdsText,
  safeMapFileName,
  type MapSink,
  type MirrorDef,
} from './osuMigration'

const MIRRORS: MirrorDef[] = [
  { name: 'a', full: 'https://a/{id}', nv: null, cap: 2 },
  { name: 'b', full: 'https://b/{id}', nv: 'https://b/{id}?nv', cap: 1 },
]

function memorySink(existing: string[] = []) {
  const files = new Map<string, Uint8Array>()
  const aborted: string[] = []
  const sink: MapSink = {
    label: 'memory',
    async existingIds() {
      return new Set(existing)
    },
    async open(_id, name) {
      const parts: Uint8Array[] = []
      return {
        async write(c) {
          parts.push(c)
        },
        async close() {
          const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
          let o = 0
          for (const p of parts) {
            out.set(p, o)
            o += p.byteLength
          }
          files.set(name, out)
        },
        async abort() {
          aborted.push(name)
        },
      }
    },
  }
  return { sink, files, aborted }
}

const zip = (id: string) => new TextEncoder().encode(`PK-zip-${id}`)

function ok(body: Uint8Array): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Length': String(body.byteLength) },
  })
}

/** Virtual clock so cooldowns and retry waits finish instantly. */
function clock() {
  let t = 1_000_000
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
      await Promise.resolve()
    },
  }
}

function engine(
  fetchImpl: (url: string) => Promise<Response> | Response,
  sink: MapSink,
  extra: { noVideo?: boolean; workers?: number } = {},
) {
  const c = clock()
  return new OsuMigrationEngine({
    sink,
    mirrors: MIRRORS,
    fetch: (async (input: RequestInfo | URL) =>
      fetchImpl(String(input))) as typeof fetch,
    now: c.now,
    sleep: c.sleep,
    workers: extra.workers ?? 3,
    noVideo: extra.noVideo,
  })
}

async function waitIdle(e: OsuMigrationEngine) {
  for (let i = 0; i < 5000 && e.running; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
  expect(e.running).toBe(false)
}

async function runToEnd(e: OsuMigrationEngine) {
  e.start()
  await waitIdle(e)
}

describe('parseIdsText', () => {
  it('reads ids.txt lines, bare ids and beatmap links, deduped', () => {
    const text = [
      '﻿1004468\tParry Gripp - Guinea Pig Bridge',
      '# comment',
      '',
      '1014716',
      'https://osu.ppy.sh/beatmapsets/555#osu/1',
      'https://osu.ppy.sh/s/777',
      '1004468\tdup',
      'not an id',
    ].join('\r\n')
    expect(parseIdsText(text)).toEqual([
      { id: '1004468', title: 'Parry Gripp - Guinea Pig Bridge' },
      { id: '1014716', title: '' },
      { id: '555', title: '' },
      { id: '777', title: '' },
    ])
  })
})

describe('file names', () => {
  it('makes safe names and reads ids back', () => {
    expect(safeMapFileName('12', 'A/B: C?')).toBe('12 A_B_ C_.osz')
    expect(safeMapFileName('12', '  ')).toBe('12.osz')
    expect(idFromFileName('12 A_B_ C_.osz')).toBe('12')
    expect(idFromFileName('12.osz.crdownload')).toBeNull()
    expect(idFromFileName('notes.osz')).toBeNull()
  })

  it('leaves catboy out of the browser mirrors (no CORS)', () => {
    expect(BROWSER_MIRRORS.map((m) => m.name)).not.toContain('catboy')
  })
})

describe('OsuMigrationEngine', () => {
  it('downloads every map, spreads them over mirrors, and skips ones already saved', async () => {
    const { sink, files } = memorySink(['3'])
    const used = new Set<string>()
    const e = engine((url) => {
      used.add(new URL(url).host)
      return ok(zip(url.split('/').pop()!))
    }, sink)
    await e.load(parseIdsText('1\tOne\n2\tTwo\n3\tThree\n4\n'))
    await runToEnd(e)

    const snap = e.snapshot()
    expect(snap.counts.done).toBe(4)
    expect(snap.counts.skipped).toBe(1)
    expect([...files.keys()].sort()).toEqual(['1 One.osz', '2 Two.osz', '4.osz'])
    expect(new TextDecoder().decode(files.get('2 Two.osz'))).toBe('PK-zip-2')
    expect(used).toEqual(new Set(['a', 'b']))
    expect(snap.finished).toBe(true)
  })

  it('fails a map at once when no mirror has it', async () => {
    const { sink, files } = memorySink()
    const e = engine(() => new Response('nope', { status: 404 }), sink)
    await e.load([{ id: '9', title: 'Gone' }])
    await runToEnd(e)
    const it = e.snapshot().items[0]
    expect(it.status).toBe('failed')
    expect(it.error).toBe('not available on any mirror')
    expect(files.size).toBe(0)
    expect(e.failedList()).toBe('9\tGone')
  })

  it('treats a non-zip response as missing and moves to the next mirror', async () => {
    const { sink, files } = memorySink()
    const e = engine(
      (url) =>
        url.startsWith('https://a/')
          ? new Response('<html>captcha</html>', { status: 200 })
          : ok(zip('5')),
      sink,
    )
    await e.load([{ id: '5', title: '' }])
    await runToEnd(e)
    expect(e.snapshot().items[0].status).toBe('done')
    expect(e.snapshot().items[0].mirror).toBe('b')
    expect(files.has('5.osz')).toBe(true)
  })

  it('rests a rate-limited mirror and finishes on the other one', async () => {
    const { sink } = memorySink()
    const e = engine(
      (url) =>
        url.startsWith('https://a/')
          ? new Response('slow down', { status: 429 })
          : ok(zip('x')),
      sink,
      { workers: 1 },
    )
    await e.load([{ id: '10', title: '' }, { id: '11', title: '' }])
    await runToEnd(e)
    const snap = e.snapshot()
    expect(snap.counts.done).toBe(2)
    expect(snap.mirrors.find((m) => m.name === 'a')!.cooldownSeconds).toBeGreaterThan(0)
    expect(snap.log.some((l) => l.includes('a rate-limited'))).toBe(true)
  })

  it('retries over 3 rounds on network errors before failing, then retryFailed requeues', async () => {
    const { sink } = memorySink()
    let calls = 0
    const e = engine(() => {
      calls++
      throw new TypeError('Failed to fetch')
    }, sink)
    await e.load([{ id: '20', title: '' }])
    await runToEnd(e)
    expect(e.snapshot().items[0].status).toBe('failed')
    expect(calls).toBe(6) // 2 mirrors × 3 rounds
    expect(e.retryFailed()).toBe(1)
    await waitIdle(e)
    // Both mirrors are still resting from the first run, so round 1 is spent
    // waiting and rounds 2-3 hit each mirror once (same as download.py).
    expect(calls).toBe(10)
    expect(e.snapshot().items[0].status).toBe('failed')
  })

  it('uses the no-video URL when asked and prefers mirrors that have one', async () => {
    const { sink } = memorySink()
    const urls: string[] = []
    const e = engine(
      (url) => {
        urls.push(url)
        return ok(zip('v'))
      },
      sink,
      { noVideo: true, workers: 1 },
    )
    await e.load([{ id: '30', title: '' }])
    await runToEnd(e)
    expect(urls).toEqual(['https://b/30?nv'])
  })

  it('stop aborts an in-flight download, keeps finished maps, and can resume', async () => {
    const { sink, files, aborted } = memorySink()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const e = engine((url) => {
      const id = url.split('/').pop()!
      if (id !== '41') return ok(zip(id))
      const stream = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(new TextEncoder().encode('PK'))
          await gate
          c.enqueue(new TextEncoder().encode('-rest'))
          c.close()
        },
      })
      return new Response(stream, { headers: { 'Content-Length': '7' } })
    }, sink)
    await e.load([{ id: '40', title: '' }, { id: '41', title: '' }])
    e.start()
    for (let i = 0; i < 50 && !files.has('40.osz'); i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
    const stopped = e.stop()
    release()
    await stopped
    expect(e.running).toBe(false)
    expect(files.has('40.osz')).toBe(true)
    expect(aborted).toContain('41.osz')
    expect(e.snapshot().items.find((i) => i.id === '41')!.status).toBe('queued')
    expect(e.snapshot().log.at(-1)).toContain('Stopped.')
  })
})
