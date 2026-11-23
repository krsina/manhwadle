/**
 * Browser port of the owner's osu! stable → lazer migration downloader
 * (download.py): bulk-download beatmapsets from public mirrors into a folder.
 *
 * Same behaviour as the script: each map starts on a different mirror, each
 * mirror has a cap on simultaneous downloads, a rate-limited mirror rests
 * (60s, doubling) while the others carry on, and a map only fails after every
 * mirror has been tried 3 times (or at once if no mirror has it).
 *
 * catboy.best is left out: it does not send CORS headers, so a web page
 * cannot read its responses.
 */

export interface MirrorDef {
  name: string
  full: string
  /** No-video URL, or null when the mirror has no such variant. */
  nv: string | null
  cap: number
}

export const BROWSER_MIRRORS: readonly MirrorDef[] = [
  { name: 'osu.direct', full: 'https://osu.direct/api/d/{id}', nv: null, cap: 2 },
  {
    name: 'sayobot',
    full: 'https://dl.sayobot.cn/beatmaps/download/full/{id}',
    nv: 'https://dl.sayobot.cn/beatmaps/download/novideo/{id}',
    cap: 2,
  },
  {
    name: 'nerinyan',
    full: 'https://api.nerinyan.moe/d/{id}',
    nv: 'https://api.nerinyan.moe/d/{id}?noVideo=true',
    cap: 1,
  },
]

export const MAX_WORKERS = BROWSER_MIRRORS.reduce((n, m) => n + m.cap, 0)

// ---------------------------------------------------------------- parsing

export interface MapEntry {
  id: string
  title: string
}

/** Accepts ids.txt lines ('123<TAB>Artist - Title'), bare IDs, or beatmap URLs. */
export function parseIdsText(text: string): MapEntry[] {
  const out: MapEntry[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^﻿/, '')
    if (!line || line.startsWith('#')) continue
    let id: string
    let title = ''
    const url = /beatmapsets\/(\d+)/.exec(line) ?? /\/s\/(\d+)/.exec(line)
    if (url) {
      id = url[1]
    } else {
      const m = /^(\d+)\s*(.*)$/.exec(line)
      if (!m) continue
      id = m[1]
      title = m[2].trim()
      if (title.startsWith(`${id} `)) title = title.slice(id.length).trim()
    }
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, title })
  }
  return out
}

/** File name for a map, safe on macOS and Windows. */
export function safeMapFileName(id: string, title: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^[ .]+|[ .]+$/g, '').slice(0, 150)
  return clean ? `${id} ${clean}.osz` : `${id}.osz`
}

/** Leading beatmapset id of an .osz file name, or null. */
export function idFromFileName(name: string): string | null {
  if (!name.toLowerCase().endsWith('.osz')) return null
  const m = /^(\d+)/.exec(name)
  return m ? m[1] : null
}

// ---------------------------------------------------------------- storage

export interface MapWriter {
  write(chunk: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

/** Where finished maps go (a picked folder, or the browser's Downloads). */
export interface MapSink {
  readonly label: string
  existingIds(): Promise<Set<string>>
  open(id: string, fileName: string): Promise<MapWriter>
}

// ---------------------------------------------------------------- engine

export type MapStatus = 'queued' | 'downloading' | 'waiting' | 'done' | 'failed'

export interface MapItem {
  n: number
  id: string
  title: string
  status: MapStatus
  mirror: string
  got: number
  size: number
  error: string
  skipped: boolean
}

interface MirrorState {
  def: MirrorDef
  active: number
  ok: number
  fail: number
  until: number
  strikes: number
  f403: number
  hadSuccess: boolean
  last: string
}

export interface MirrorSnapshot {
  name: string
  active: number
  cap: number
  ok: number
  fail: number
  cooldownSeconds: number
  last: string
  noVideo: boolean
}

export interface EngineSnapshot {
  running: boolean
  paused: boolean
  stopping: boolean
  finished: boolean
  workers: number
  noVideo: boolean
  counts: Record<MapStatus, number> & { total: number; skipped: number }
  bytesPerSecond: number
  mirrors: MirrorSnapshot[]
  items: MapItem[]
  log: string[]
}

export interface EngineOptions {
  sink: MapSink
  fetch?: typeof fetch
  mirrors?: readonly MirrorDef[]
  workers?: number
  noVideo?: boolean
  rounds?: number
  baseCooldownMs?: number
  /** Abort a download that receives no bytes for this long. */
  idleTimeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

class HttpStatusError extends Error {
  status: number
  retryAfterMs: number | null
  constructor(status: number, retryAfterMs: number | null) {
    super(String(status))
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}
class NotArchiveError extends Error {}
class DroppedError extends Error {}

type FetchResult = 'ok' | 'stopped' | 'notfound' | 'fail'

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export class OsuMigrationEngine {
  readonly items: MapItem[] = []
  private readonly index = new Map<string, MapItem>()
  private queue: MapItem[] = []
  private readonly mirrors: MirrorState[]
  private sink: MapSink
  private readonly fetchFn: typeof fetch
  private readonly rounds: number
  private readonly baseCooldownMs: number
  private readonly idleTimeoutMs: number
  private readonly now: () => number
  private readonly sleepFn: (ms: number) => Promise<void>
  private readonly inflight = new Set<AbortController>()
  private readonly samples: Array<[number, number]> = []
  private readonly logLines: string[] = []
  private target: number
  private alive = 0
  private noVideo: boolean
  private paused = false
  private stopping = false
  private finished = false
  private idleWaiters: Array<() => void> = []

  constructor(opts: EngineOptions) {
    this.sink = opts.sink
    this.fetchFn = opts.fetch ?? ((...args) => fetch(...args))
    this.mirrors = (opts.mirrors ?? BROWSER_MIRRORS).map((def) => ({
      def,
      active: 0,
      ok: 0,
      fail: 0,
      until: 0,
      strikes: 0,
      f403: 0,
      hadSuccess: false,
      last: '',
    }))
    this.target = clampWorkers(opts.workers ?? 4, this.mirrors)
    this.noVideo = opts.noVideo ?? false
    this.rounds = opts.rounds ?? 3
    this.baseCooldownMs = opts.baseCooldownMs ?? 60_000
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 60_000
    this.now = opts.now ?? (() => Date.now())
    this.sleepFn = opts.sleep ?? defaultSleep
  }

  get running(): boolean {
    return this.alive > 0
  }

  private addLog(msg: string) {
    const t = new Date(this.now()).toTimeString().slice(0, 8)
    this.logLines.push(`${t}  ${msg}`)
    if (this.logLines.length > 300) this.logLines.splice(0, this.logLines.length - 300)
  }

  /** Switch where maps are saved (only while idle). Re-checks what is already there. */
  async setSink(sink: MapSink): Promise<void> {
    if (this.running) throw new Error('Stop downloads before changing the folder.')
    this.sink = sink
    const have = await sink.existingIds()
    let marked = 0
    for (const it of this.items) {
      const done = have.has(it.id)
      if (done && it.status !== 'done') marked++
      if (done) Object.assign(it, { status: 'done', skipped: true, error: '' })
      else if (it.skipped) Object.assign(it, { status: 'queued', skipped: false })
    }
    this.addLog(`Saving to ${sink.label}${marked ? ` (${marked} already there)` : ''}`)
  }

  async load(entries: MapEntry[]): Promise<number> {
    const have = await this.sink.existingIds()
    let added = 0
    let already = 0
    for (const { id, title } of entries) {
      if (this.index.has(id)) continue
      const done = have.has(id)
      const it: MapItem = {
        n: this.items.length,
        id,
        title,
        status: done ? 'done' : 'queued',
        mirror: '',
        got: 0,
        size: 0,
        error: '',
        skipped: done,
      }
      this.items.push(it)
      this.index.set(id, it)
      added++
      if (done) already++
      else if (this.running && !this.stopping) this.queue.push(it)
    }
    if (added) {
      this.addLog(`Loaded ${added} beatmapsets (${already} already downloaded)`)
      this.finished = false
    }
    return added
  }

  start(): void {
    if (this.running) {
      this.paused = false
      return
    }
    this.queue = this.items.filter((it) => it.status === 'queued')
    this.finished = false
    this.paused = false
    this.stopping = false
    if (!this.queue.length) {
      this.addLog('Nothing to download.')
      this.finished = true
      return
    }
    this.addLog(`Starting ${this.queue.length} downloads with ${this.target} in parallel`)
    this.spawn()
  }

  private spawn() {
    while (this.alive < this.target && this.queue.length) {
      this.alive++
      void this.worker()
    }
  }

  setWorkers(n: number): void {
    this.target = clampWorkers(n, this.mirrors)
    if (this.running && !this.stopping) this.spawn()
  }

  setNoVideo(v: boolean): void {
    this.noVideo = v
  }

  pause(v = true): void {
    if (this.running) this.paused = v
  }

  /** Abort in-flight downloads; finished maps are kept. Resolves once idle. */
  async stop(): Promise<void> {
    if (!this.running) return
    this.stopping = true
    for (const c of this.inflight) c.abort()
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve))
  }

  retryFailed(): number {
    let n = 0
    for (const it of this.items) {
      if (it.status === 'failed') {
        Object.assign(it, { status: 'queued', error: '', got: 0 })
        if (this.running && !this.stopping) this.queue.push(it)
        n++
      }
    }
    if (n) {
      this.addLog(`Retrying ${n} failed maps`)
      if (this.running) this.spawn()
      else this.start()
    }
    return n
  }

  failedList(): string {
    return this.items
      .filter((it) => it.status === 'failed')
      .map((it) => `${it.id}\t${it.title}`)
      .join('\n')
  }

  snapshot(): EngineSnapshot {
    const now = this.now()
    const counts = {
      queued: 0,
      downloading: 0,
      waiting: 0,
      done: 0,
      failed: 0,
      total: this.items.length,
      skipped: 0,
    }
    for (const it of this.items) {
      counts[it.status]++
      if (it.skipped) counts.skipped++
    }
    while (this.samples.length && this.samples[0][0] < now - 10_000) this.samples.shift()
    const bytes = this.samples.reduce((s, [, b]) => s + b, 0)
    const span = this.samples.length ? Math.max(1_000, now - this.samples[0][0]) : 1_000
    return {
      running: this.running,
      paused: this.paused,
      stopping: this.stopping,
      finished: this.finished,
      workers: this.target,
      noVideo: this.noVideo,
      counts,
      bytesPerSecond: (bytes * 1000) / span,
      mirrors: this.mirrors.map((m) => ({
        name: m.def.name,
        active: m.active,
        cap: m.def.cap,
        ok: m.ok,
        fail: m.fail,
        cooldownSeconds: Math.max(0, Math.ceil((m.until - now) / 1000)),
        last: m.last,
        noVideo: m.def.nv !== null,
      })),
      items: this.items.map((it) => ({ ...it })),
      log: [...this.logLines],
    }
  }

  // ------------------------------------------------------------ internals

  private async worker(): Promise<void> {
    try {
      for (;;) {
        if (this.stopping || this.alive > this.target) break
        if (this.paused) {
          await this.sleepFn(300)
          continue
        }
        const it = this.queue.shift()
        if (!it) break
        if (it.status !== 'queued') continue
        it.status = 'downloading'
        await this.process(it)
      }
    } finally {
      this.alive--
      if (this.alive === 0) this.onIdle()
    }
  }

  private onIdle() {
    for (const it of this.items) {
      if (it.status === 'downloading' || it.status === 'waiting') it.status = 'queued'
    }
    this.queue = []
    const ok = this.items.filter((it) => it.status === 'done').length
    const failed = this.items.filter((it) => it.status === 'failed').length
    if (this.stopping) {
      this.addLog(`Stopped. ${ok} done, ${failed} failed. Press Start to continue.`)
    } else {
      this.finished = true
      this.addLog(`Finished. ${ok} done, ${failed} failed.`)
    }
    this.stopping = false
    this.paused = false
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const w of waiters) w()
  }

  private pick(tried: Set<string>, n: number): MirrorState | null {
    const now = this.now()
    const N = this.mirrors.length
    let best: MirrorState | null = null
    let bestKey: number[] | null = null
    for (let i = 0; i < N; i++) {
      const m = this.mirrors[i]
      if (tried.has(m.def.name) || now < m.until || m.active >= m.def.cap) continue
      // Prefer: has a no-video URL (when wanted) → least loaded → rotation by map number.
      const key = [
        this.noVideo && m.def.nv === null ? 1 : 0,
        m.active / m.def.cap,
        (((i - n) % N) + N) % N,
      ]
      if (!bestKey || compareKeys(key, bestKey) < 0) {
        best = m
        bestKey = key
      }
    }
    if (best) best.active++
    return best
  }

  private async sleepUnlessStopping(ms: number) {
    const end = this.now() + ms
    while (this.now() < end && !this.stopping) {
      await this.sleepFn(Math.min(250, end - this.now()))
    }
  }

  private async process(it: MapItem): Promise<void> {
    const tried = new Set<string>()
    const notFound = new Set<string>()
    let rounds = 0
    for (;;) {
      if (this.stopping) return
      const m = this.pick(tried, it.n)
      if (!m) {
        const now = this.now()
        const free = this.mirrors.filter(
          (x) => !tried.has(x.def.name) && now >= x.until,
        )
        if (free.length) {
          // A mirror is free but at its cap: wait for a slot.
          await this.sleepFn(300)
          continue
        }
        if (notFound.size === this.mirrors.length) {
          this.fail(it, 'not available on any mirror')
          return
        }
        rounds++
        if (rounds >= this.rounds) {
          this.fail(it, it.error || 'all mirrors failed')
          return
        }
        tried.clear()
        notFound.clear()
        it.status = 'waiting'
        const soonest = Math.min(
          ...this.mirrors.map((x) => Math.max(0, x.until - this.now())),
        )
        await this.sleepUnlessStopping(Math.min(120_000, Math.max(5_000 * rounds, soonest)))
        if (it.status === 'waiting') it.status = 'downloading'
        continue
      }
      tried.add(m.def.name)
      let result: FetchResult
      try {
        result = await this.fetchOne(it, m)
      } finally {
        m.active--
      }
      if (result === 'ok' || result === 'stopped') return
      if (result === 'notfound') notFound.add(m.def.name)
    }
  }

  private fail(it: MapItem, why: string) {
    Object.assign(it, { status: 'failed', error: why, got: 0 })
    this.addLog(`FAIL ${it.id} ${it.title} - ${why}`)
  }

  private async fetchOne(it: MapItem, m: MirrorState): Promise<FetchResult> {
    const url = (this.noVideo && m.def.nv ? m.def.nv : m.def.full).replace('{id}', it.id)
    Object.assign(it, { mirror: m.def.name, got: 0, size: 0 })

    const ctrl = new AbortController()
    this.inflight.add(ctrl)
    let idle: ReturnType<typeof setTimeout> | undefined
    const armIdle = () => {
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => ctrl.abort(), this.idleTimeoutMs)
    }
    let writer: MapWriter | null = null
    let status: number | null = null
    let retryAfterMs: number | null = null
    let reason = ''

    try {
      armIdle()
      const res = await this.fetchFn(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        redirect: 'follow',
      })
      if (!res.ok) {
        void res.body?.cancel().catch(() => {})
        throw new HttpStatusError(res.status, parseRetryAfter(res.headers.get('Retry-After')))
      }
      status = res.status
      const size = Number(res.headers.get('Content-Length') ?? 0) || 0
      it.size = size
      if (!res.body) throw new NotArchiveError()
      const reader = res.body.getReader()

      // Read until we have at least the 2-byte zip signature.
      const head: Uint8Array[] = []
      let headLen = 0
      while (headLen < 2) {
        const { done, value } = await reader.read()
        if (done) break
        armIdle()
        head.push(value)
        headLen += value.byteLength
      }
      const first = concat(head)
      if (first.byteLength < 2 || first[0] !== 0x50 || first[1] !== 0x4b) {
        void reader.cancel().catch(() => {})
        throw new NotArchiveError()
      }

      writer = await this.sink.open(it.id, safeMapFileName(it.id, it.title))
      await writer.write(first)
      let got = first.byteLength
      this.count(first.byteLength)
      it.got = got
      for (;;) {
        if (this.stopping) {
          void reader.cancel().catch(() => {})
          await writer.abort()
          writer = null
          Object.assign(it, { status: 'queued', got: 0 })
          return 'stopped'
        }
        const { done, value } = await reader.read()
        if (done) break
        armIdle()
        await writer.write(value)
        got += value.byteLength
        it.got = got
        this.count(value.byteLength)
      }
      if (size && got < size) throw new DroppedError('connection dropped')
      await writer.close()
      writer = null

      Object.assign(m, { strikes: 0, f403: 0, hadSuccess: true, last: 'ok' })
      m.ok++
      Object.assign(it, { status: 'done', got, size: got, error: '' })
      this.addLog(`ok   ${it.id} via ${m.def.name} (${(got / 1e6).toFixed(1)} MB) ${it.title}`)
      return 'ok'
    } catch (err) {
      if (writer) await writer.abort().catch(() => {})
      if (this.stopping) {
        Object.assign(it, { status: 'queued', got: 0 })
        return 'stopped'
      }
      if (err instanceof HttpStatusError) {
        status = err.status
        retryAfterMs = err.retryAfterMs
      } else if (err instanceof NotArchiveError) {
        status = null
        reason = 'bad file'
      } else {
        status = null
        reason = ctrl.signal.aborted
          ? 'timed out'
          : err instanceof DroppedError
            ? 'connection dropped'
            : 'network error'
      }
    } finally {
      if (idle) clearTimeout(idle)
      this.inflight.delete(ctrl)
    }

    const now = this.now()
    m.fail++
    m.last = status && !reason ? String(status) : reason || 'error'
    // Some mirrors answer "missing map" with 403, so a 403 only means "rate
    // limited" once it repeats several times in a row on a mirror that worked.
    m.f403 = status === 403 ? m.f403 + 1 : 0
    const rateLimited =
      status === 429 || status === 503 || (status === 403 && m.hadSuccess && m.f403 >= 3)
    if (rateLimited) {
      m.f403 = 0
      m.strikes++
      const cd = retryAfterMs ?? this.baseCooldownMs * 2 ** Math.min(m.strikes - 1, 3)
      m.until = Math.max(m.until, now + cd)
      this.addLog(`${m.def.name} rate-limited, resting ${Math.round(cd / 1000)}s`)
    } else if (status === null && reason !== 'bad file') {
      m.until = Math.max(m.until, now + 15_000)
    } else if (status !== null && status >= 500) {
      m.until = Math.max(m.until, now + 30_000)
    }
    Object.assign(it, { error: `${m.def.name}: ${m.last}`, got: 0 })
    if (status === 403 || status === 404 || reason === 'bad file') return 'notfound'
    return 'fail'
  }

  private count(bytes: number) {
    this.samples.push([this.now(), bytes])
  }
}

function clampWorkers(n: number, mirrors: readonly MirrorState[]): number {
  const max = mirrors.reduce((s, m) => s + m.def.cap, 0)
  return Math.max(1, Math.min(max, Math.round(n) || 1))
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const s = Number(value)
  return Number.isFinite(s) && s > 0 ? s * 1000 : null
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.byteLength
  }
  return out
}
