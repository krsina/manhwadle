/**
 * Build character-image-review.json for the review webpage.
 *
 * Sources:
 *   manhwadle-etl/output/catalog.json
 *   manhwadle-etl/output/catalog.enrich-images.checkpoint.json (optional)
 *   src/data/manhwa.json (optional — in-game pool)
 *
 * Usage: node scripts/build-character-image-review.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ETL_OUT = join(ROOT, 'manhwadle-etl', 'output')
const DATA_DIR = join(ROOT, 'src', 'data')

const PLACEHOLDER_RE = /\/character\/(?:large|medium)\/default\.jpg(?:\?|$)/i

function hasRealImage(char) {
  const large = char?.image?.large || ''
  const medium = char?.image?.medium || ''
  if (!large && !medium) return false
  if (PLACEHOLDER_RE.test(large) || PLACEHOLDER_RE.test(medium)) return false
  return true
}

function isPlaceholder(char) {
  return !hasRealImage(char)
}

function titleOf(entry) {
  if (typeof entry?.title === 'string') return entry.title
  const t = entry?.title || entry?.titles || {}
  return t.english || t.romaji || t.native || `Manhwa #${entry?.id ?? '?'}`
}

function charName(char) {
  const n = char?.name
  if (typeof n === 'string') return n
  return n?.full || n?.native || `Character #${char?.id ?? '?'}`
}

async function loadJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

function manhwaMeta(m) {
  return {
    id: m.id,
    title: titleOf(m),
    rank: m.rank ?? null,
    idMal: m.idMal ?? null,
  }
}

const catalog = await loadJson(join(ETL_OUT, 'catalog.json'))
if (!catalog?.characters) {
  console.error('Missing manhwadle-etl/output/catalog.json')
  process.exit(1)
}

const checkpoint = await loadJson(
  join(ETL_OUT, 'catalog.enrich-images.checkpoint.json'),
  { filled: {}, unmatched: {} },
)
const gamePool = await loadJson(join(DATA_DIR, 'manhwa.json'), [])

const manhwaById = new Map((catalog.manhwa || []).map((m) => [m.id, m]))
const charById = new Map((catalog.characters || []).map((c) => [c.id, c]))

const appsByChar = new Map()
for (const app of catalog.appearances || []) {
  if (!appsByChar.has(app.characterId)) appsByChar.set(app.characterId, [])
  appsByChar.get(app.characterId).push(app)
}

const gameCharIds = new Set()
const gamePlaceholderIds = new Set()
for (const m of gamePool) {
  for (const c of m.characters || []) {
    gameCharIds.add(c.id)
    if (isPlaceholder(c)) gamePlaceholderIds.add(c.id)
  }
}

function appearancesForCharacter(charId) {
  const apps = appsByChar.get(charId) || []
  const seen = new Set()
  const rows = []
  for (const app of apps) {
    const mid = app.manhwaId
    if (seen.has(mid)) continue
    seen.add(mid)
    const m = manhwaById.get(mid)
    if (!m) continue
    rows.push({
      ...manhwaMeta(m),
      role: app.role || 'BACKGROUND',
    })
  }
  rows.sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999) || a.title.localeCompare(b.title))
  return rows
}

const enriched = []
for (const [cidStr, info] of Object.entries(checkpoint.filled || {})) {
  const cid = Number(cidStr)
  const char = charById.get(cid)
  if (!char) continue
  enriched.push({
    characterId: cid,
    characterName: charName(char),
    malName: info.malName || null,
    malCharacterId: info.malId ?? null,
    idMal: info.idMal ?? null,
    source: info.source || 'mal',
    imageBefore:
      'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg',
    imageAfter: info.image || char.image?.large || char.image?.medium || null,
    manhwa: appearancesForCharacter(cid),
    inGamePool: gameCharIds.has(cid),
  })
}
enriched.sort((a, b) => a.characterName.localeCompare(b.characterName))

const placeholders = []
for (const char of catalog.characters || []) {
  if (!isPlaceholder(char)) continue
  placeholders.push({
    characterId: char.id,
    characterName: charName(char),
    image: char.image?.large || char.image?.medium || null,
    manhwa: appearancesForCharacter(char.id),
    inGamePool: gamePlaceholderIds.has(char.id),
    enrichStatus: checkpoint.unmatched?.[String(char.id)]
      ? 'unmatched'
      : checkpoint.filled?.[String(char.id)]
        ? 'filled'
        : 'pending',
  })
}
placeholders.sort((a, b) => {
  const ra = a.manhwa[0]?.rank ?? 99999
  const rb = b.manhwa[0]?.rank ?? 99999
  if (ra !== rb) return ra - rb
  return a.characterName.localeCompare(b.characterName)
})

const gameOnlyPlaceholders = []
for (const m of gamePool) {
  for (const c of m.characters || []) {
    if (!isPlaceholder(c)) continue
    gameOnlyPlaceholders.push({
      characterId: c.id,
      characterName: charName(c),
      image: c.image?.large || c.image?.medium || null,
      manhwa: [
        {
          id: m.id,
          title: titleOf(m),
          rank: m.rank ?? null,
          role: c.role || 'BACKGROUND',
        },
      ],
      inCatalogPlaceholder: isPlaceholder(charById.get(c.id) || c),
    })
  }
}

const doc = {
  generatedAt: new Date().toISOString(),
  stats: {
    catalogCharacters: catalog.characters.length,
    catalogPlaceholders: placeholders.length,
    enriched: enriched.length,
    enrichUnmatched: Object.keys(checkpoint.unmatched || {}).length,
    gamePoolCharacters: gameCharIds.size,
    gamePoolPlaceholders: gameOnlyPlaceholders.length,
    gameTitlesWithPlaceholders: new Set(gameOnlyPlaceholders.map((r) => r.manhwa[0]?.id)).size,
  },
  enriched,
  placeholders,
  gamePoolPlaceholders: gameOnlyPlaceholders,
}

await mkdir(DATA_DIR, { recursive: true })
const outPath = join(DATA_DIR, 'character-image-review.json')
await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outPath}`)
console.log(JSON.stringify(doc.stats, null, 2))
