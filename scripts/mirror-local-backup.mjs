#!/usr/bin/env node
/**
 * Local offline mirror of top-1000 game data + images.
 *
 * Copies JSON snapshots and downloads every unique cover/character image
 * into local-backup/ (gitignored). Safe to re-run; skips files that already exist.
 *
 * Usage: node scripts/mirror-local-backup.mjs
 *        npm run backup:local
 */

import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'src', 'data')
const OUT_DIR = join(ROOT, 'local-backup')
const IMG_DIR = join(OUT_DIR, 'images')
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json')

const CONCURRENCY = 4
const MAX_ATTEMPTS = 4
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const JSON_SNAPSHOTS = [
  'manhwa.json',
  'storyDescriptionBlurb.json',
  'title-aliases.json',
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function extFromMagic(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return '.png'
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp'
  }
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) {
    return '.gif'
  }
  return null
}

function extFromUrlOrType(url, contentType) {
  const pathExt = extname(new URL(url).pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(pathExt)) {
    return pathExt === '.jpeg' ? '.jpg' : pathExt
  }
  const ct = (contentType || '').split(';')[0].trim().toLowerCase()
  if (ct === 'image/png') return '.png'
  if (ct === 'image/webp') return '.webp'
  if (ct === 'image/gif') return '.gif'
  if (ct === 'image/avif') return '.avif'
  return '.jpg'
}

function stableRel(kind, id, ext) {
  return `images/${kind}/${id}${ext}`
}

async function pathExists(path) {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

async function findExisting(kind, id) {
  const dir = join(IMG_DIR, kind)
  for (const ext of ['.jpg', '.png', '.webp', '.gif', '.avif']) {
    const p = join(dir, `${id}${ext}`)
    if (await pathExists(p)) return p
  }
  return null
}

async function cleanStaleTemps(dir) {
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.endsWith('.tmp') || name.endsWith('.partial')) {
      try {
        await unlink(join(dir, name))
      } catch {
        /* ignore */
      }
    }
  }
}

async function downloadOnce(url, kind, id) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    err.retryAfterMs = Number(res.headers.get('retry-after')) * 1000 || null
    throw err
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 24) throw new Error('empty/short body')

  const contentType = res.headers.get('content-type') || ''
  const ext =
    extFromMagic(buf) || extFromUrlOrType(url, contentType)
  const finalPath = join(OUT_DIR, stableRel(kind, id, ext))
  await mkdir(dirname(finalPath), { recursive: true })

  // Unique partial name avoids Windows rename races / Defender tmp clashes.
  const partial = join(
    dirname(finalPath),
    `${id}.${process.pid}.${randomBytes(4).toString('hex')}.partial`,
  )
  await writeFile(partial, buf)
  // Prefer replace via write+unlink over rename-overwrite (flaky on Windows).
  try {
    await unlink(finalPath)
  } catch {
    /* not present */
  }
  try {
    await rename(partial, finalPath)
  } catch {
    // Fallback if rename still flakes: copy then delete partial.
    await writeFile(finalPath, buf)
    try {
      await unlink(partial)
    } catch {
      /* ignore */
    }
  }

  const sha1 = createHash('sha1').update(buf).digest('hex')
  return {
    path: finalPath,
    bytes: buf.length,
    contentType,
    sha1,
    ext,
  }
}

function isRetryable(err) {
  const status = err?.status
  if (status === 429 || status === 503 || status === 502 || status === 500) return true
  const msg = String(err?.message || err)
  if (/ENOENT|EPERM|EBUSY|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(msg)) return true
  return false
}

async function downloadWithRetry(url, kind, id) {
  let lastErr
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await downloadOnce(url, kind, id)
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break
      const backoff =
        err.retryAfterMs ||
        Math.min(8000, 400 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 200)
      await sleep(backoff)
    }
  }
  throw lastErr
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

async function main() {
  const manhwa = JSON.parse(await readFile(join(DATA_DIR, 'manhwa.json'), 'utf8'))
  await mkdir(join(OUT_DIR, 'data'), { recursive: true })
  await mkdir(join(IMG_DIR, 'covers'), { recursive: true })
  await mkdir(join(IMG_DIR, 'characters'), { recursive: true })
  await cleanStaleTemps(join(IMG_DIR, 'covers'))
  await cleanStaleTemps(join(IMG_DIR, 'characters'))

  for (const name of JSON_SNAPSHOTS) {
    const src = join(DATA_DIR, name)
    try {
      await copyFile(src, join(OUT_DIR, 'data', name))
      console.log(`[json] ${name}`)
    } catch {
      console.log(`[json] skip missing ${name}`)
    }
  }

  /** @type {Map<string, { kind: string, id: number, url: string }>} */
  const jobs = new Map()

  for (const m of manhwa) {
    const cover = m.coverImage
    if (cover) {
      const key = `cover:${m.id}`
      if (!jobs.has(key)) jobs.set(key, { kind: 'cover', id: m.id, url: cover })
    }
    for (const c of m.characters || []) {
      const url = c.image?.large || c.image?.medium
      if (!url) continue
      const key = `character:${c.id}`
      if (!jobs.has(key)) jobs.set(key, { kind: 'character', id: c.id, url })
    }
  }

  const list = [...jobs.values()]
  console.log(`[images] ${list.length} unique assets to mirror (concurrency=${CONCURRENCY})`)

  let ok = 0
  let skipped = 0
  let failed = 0
  const failures = []
  const assets = []

  await mapPool(list, CONCURRENCY, async (job) => {
    const existing = await findExisting(job.kind, job.id)
    if (existing) {
      skipped++
      const rel = existing.slice(OUT_DIR.length + 1).replace(/\\/g, '/')
      assets.push({
        kind: job.kind,
        id: job.id,
        url: job.url,
        local: rel,
        status: 'skipped',
      })
      return
    }

    try {
      const result = await downloadWithRetry(job.url, job.kind, job.id)
      ok++
      const rel = result.path.slice(OUT_DIR.length + 1).replace(/\\/g, '/')
      assets.push({
        kind: job.kind,
        id: job.id,
        url: job.url,
        local: rel,
        bytes: result.bytes,
        sha1: result.sha1,
        contentType: result.contentType,
        status: 'downloaded',
      })
      if ((ok + skipped + failed) % 50 === 0) {
        console.log(`  … ${ok} new, ${skipped} cached, ${failed} failed`)
      }
    } catch (err) {
      failed++
      const error = String(err.message || err)
      failures.push({ kind: job.kind, id: job.id, url: job.url, error })
      assets.push({
        kind: job.kind,
        id: job.id,
        url: job.url,
        local: null,
        status: 'failed',
        error,
      })
    }
  })

  const manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    source: 'src/data/manhwa.json',
    manhwaCount: manhwa.length,
    uniqueAssets: list.length,
    downloaded: ok,
    skipped,
    failed,
    assets: assets.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id),
    failures,
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  const byUrl = Object.fromEntries(assets.filter((a) => a.local).map((a) => [a.url, a.local]))
  await writeFile(join(OUT_DIR, 'url-map.json'), JSON.stringify(byUrl, null, 2) + '\n', 'utf8')

  console.log(
    `\n[done] ${OUT_DIR}\n` +
      `  downloaded=${ok} skipped=${skipped} failed=${failed}\n` +
      `  manifest=${basename(MANIFEST_PATH)}`,
  )
  if (failures.length) {
    const counts = {}
    for (const f of failures) counts[f.error] = (counts[f.error] || 0) + 1
    console.log('  failure breakdown:', counts)
    console.log('  samples:')
    for (const f of failures.slice(0, 8)) {
      console.log(`    ${f.kind}#${f.id}: ${f.error}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
