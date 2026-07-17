/**
 * Re-fetch AniList name.alternative for every character attached in manhwa.json.
 * Updates manhwa.json + ETL catalog.json characters in place, then reports diffs.
 *
 * Usage: node scripts/refresh-character-aliases-anilist.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data')
const CATALOG = join(ROOT, 'manhwadle-etl', 'output', 'catalog.json')
const BATCH = 20
const DELAY_MS = 1100
const CHECKPOINT = join(ROOT, 'scripts', 'character-alias-anilist-checkpoint.json')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function normList(list) {
  return [...new Set((list || []).map((a) => String(a).trim()).filter(Boolean))]
}

function sameSet(a, b) {
  const A = new Set(normList(a).map((x) => x.toLowerCase()))
  const B = new Set(normList(b).map((x) => x.toLowerCase()))
  if (A.size !== B.size) return false
  for (const x of A) if (!B.has(x)) return false
  return true
}

async function fetchCharacters(ids) {
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        characters(id_in: $ids) {
          id
          name { full native alternative }
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { ids } }),
  })
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') || '60')
    const err = new Error(`AniList HTTP 429`)
    err.retryAfterMs = Math.max(15, retryAfter) * 1000
    throw err
  }
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`)
  }
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  return json.data?.Page?.characters || []
}

const pool = JSON.parse(await readFile(join(DATA, 'manhwa.json'), 'utf8'))
const catalog = JSON.parse(await readFile(CATALOG, 'utf8'))

const idSet = new Set()
for (const m of pool) {
  for (const c of m.characters || []) idSet.add(c.id)
}
const ids = [...idSet].sort((a, b) => a - b)
console.log(`Refreshing AniList alternatives for ${ids.length} characters…`)

/** @type {Map<number, { full: string|null, native: string|null, alternative: string[] }>} */
const remoteById = new Map()
try {
  const prev = JSON.parse(await readFile(CHECKPOINT, 'utf8'))
  for (const [id, row] of Object.entries(prev.remoteById || {})) {
    remoteById.set(Number(id), row)
  }
  console.log(`  resumed checkpoint with ${remoteById.size} characters`)
} catch {
  /* no checkpoint */
}

const pending = ids.filter((id) => !remoteById.has(id))
console.log(`  remaining to fetch: ${pending.length}`)

for (let i = 0; i < pending.length; i += BATCH) {
  const chunk = pending.slice(i, i + BATCH)
  const page = Math.floor(i / BATCH) + 1
  const pages = Math.ceil(pending.length / BATCH)
  process.stdout.write(`  batch ${page}/${pages} (${chunk.length} ids)\r`)
  let attempt = 0
  for (;;) {
    try {
      const chars = await fetchCharacters(chunk)
      for (const c of chars) {
        remoteById.set(c.id, {
          full: c.name?.full?.trim() || null,
          native: c.name?.native?.trim() || null,
          alternative: normList(c.name?.alternative),
        })
      }
      break
    } catch (err) {
      attempt += 1
      const wait = err.retryAfterMs || 1500 * attempt
      if (attempt >= 8) throw err
      console.warn(`\n  retry ${attempt} after error: ${err.message} (wait ${Math.round(wait / 1000)}s)`)
      await sleep(wait)
    }
  }
  if (page % 10 === 0 || i + BATCH >= pending.length) {
    const dump = Object.fromEntries(remoteById)
    await writeFile(
      CHECKPOINT,
      JSON.stringify({ updatedAt: new Date().toISOString(), remoteById: dump }) + '\n',
      'utf8',
    )
  }
  await sleep(DELAY_MS)
}
console.log(`\n  fetched ${remoteById.size} characters from AniList`)

const diffs = []
let gameUpdated = 0
let catalogUpdated = 0

for (const m of pool) {
  for (const character of m.characters || []) {
    const remote = remoteById.get(character.id)
    if (!remote) continue
    const before = normList(character.name?.alternative)
    // Keep curated/local-only alts; union with AniList
    const union = []
    const seen = new Set()
    for (const a of [...remote.alternative, ...before]) {
      const key = a.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      union.push(a)
    }
    const fullKey = (character.name?.full || '').trim().toLowerCase()
    const next = union.filter((a) => a.toLowerCase() !== fullKey)
    if (!sameSet(before, next)) {
      const added = next.filter(
        (a) => !before.some((b) => b.toLowerCase() === a.toLowerCase()),
      )
      const removed = before.filter(
        (a) => !next.some((b) => b.toLowerCase() === a.toLowerCase()),
      )
      // We only union — removals shouldn't happen unless full matched an alt
      if (added.length > 0 || removed.length > 0) {
        diffs.push({
          id: character.id,
          title: m.title?.english || m.title?.romaji || m.id,
          full: character.name?.full,
          added,
          removed,
        })
      }
      character.name.alternative = next
      gameUpdated += 1
    }
  }
}

const catalogById = new Map((catalog.characters || []).map((c) => [c.id, c]))
for (const [id, remote] of remoteById) {
  const c = catalogById.get(id)
  if (!c) continue
  const before = normList(c.name?.alternative)
  if (!sameSet(before, remote.alternative)) {
    c.name = {
      ...c.name,
      full: remote.full ?? c.name?.full ?? null,
      native: remote.native ?? c.name?.native ?? null,
      alternative: remote.alternative,
    }
    catalogUpdated += 1
  }
}

await writeFile(join(DATA, 'manhwa.json'), JSON.stringify(pool, null, 2) + '\n', 'utf8')
await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

const reportPath = join(ROOT, 'scripts', 'character-alias-anilist-refresh.json')
await writeFile(
  reportPath,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      requested: ids.length,
      fetched: remoteById.size,
      gameCharactersUpdated: gameUpdated,
      catalogCharactersUpdated: catalogUpdated,
      diffs: diffs.slice(0, 500),
      diffCount: diffs.length,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)

console.log(
  `Done.\n` +
    `  game characters with alt changes: ${gameUpdated}\n` +
    `  catalog characters updated: ${catalogUpdated}\n` +
    `  report: scripts/character-alias-anilist-refresh.json`,
)
