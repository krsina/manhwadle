/**
 * For Asura missing titles, query AniList search and if the best KR manga
 * hit is already in manhwa.json, add the Asura title as a synonym.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data')

const QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 8) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      countryOfOrigin
      popularity
      title { english romaji native }
      synonyms
    }
  }
}`

async function anilistSearch(search) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { search } }),
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`AniList ${res.status}`)
    const json = await res.json()
    return json.data?.Page?.media || []
  }
  return []
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const manhwa = JSON.parse(await readFile(join(DATA, 'manhwa.json'), 'utf8'))
const poolIds = new Set(manhwa.map((m) => m.id))
const byId = new Map(manhwa.map((m) => [m.id, m]))

const coverage = JSON.parse(
  await readFile(join(ROOT, 'scripts', 'asura-coverage-report.json'), 'utf8'),
)
const prior = JSON.parse(
  await readFile(join(ROOT, 'scripts', 'asura-alias-matches.json'), 'utf8'),
)
const alreadyAccepted = new Set(
  (prior.accepted || []).map((a) => norm(a.asuraTitle)),
)

const missing = (coverage.missingTitles || []).filter(
  (t) =>
    t &&
    !alreadyAccepted.has(norm(t)) &&
    !/^(browse|status|dmca|privacy policy)$/i.test(t.trim()),
)

let aliasDoc = { meta: {}, aliases: {} }
try {
  aliasDoc = JSON.parse(await readFile(join(DATA, 'title-aliases.json'), 'utf8'))
} catch {
  /* empty */
}
aliasDoc.aliases ||= {}

const found = []
const stillMissing = []

for (let i = 0; i < missing.length; i++) {
  const title = missing[i]
  process.stderr.write(`[${i + 1}/${missing.length}] ${title}\n`)
  let results = []
  try {
    results = await anilistSearch(title)
  } catch (err) {
    process.stderr.write(`  error: ${err.message}\n`)
    stillMissing.push({ asuraTitle: title, reason: 'anilist-error' })
    await new Promise((r) => setTimeout(r, 500))
    continue
  }

  const inPool = results.filter((m) => poolIds.has(m.id))
  // Prefer KR origin when available
  const ranked = [...inPool].sort((a, b) => {
    const aKr = a.countryOfOrigin === 'KR' ? 1 : 0
    const bKr = b.countryOfOrigin === 'KR' ? 1 : 0
    if (bKr !== aKr) return bKr - aKr
    return (b.popularity || 0) - (a.popularity || 0)
  })

  const hit = ranked[0]
  if (!hit) {
    stillMissing.push({
      asuraTitle: title,
      reason: 'not-in-pool',
      anilistTop: results[0]
        ? {
            id: results[0].id,
            title: results[0].title?.english || results[0].title?.romaji,
            country: results[0].countryOfOrigin,
            popularity: results[0].popularity,
          }
        : null,
    })
  } else {
    found.push({
      asuraTitle: title,
      anilistId: hit.id,
      anilistTitle: hit.title?.english || hit.title?.romaji,
      country: hit.countryOfOrigin,
      popularity: hit.popularity,
      method: 'anilist-search',
    })
    const key = String(hit.id)
    const set = new Set(aliasDoc.aliases[key] || [])
    set.add(title)
    aliasDoc.aliases[key] = [...set].sort((a, b) => a.localeCompare(b))
    const m = byId.get(hit.id)
    if (m) {
      const syn = new Set(m.synonyms || [])
      syn.add(title)
      m.synonyms = [...syn]
    }
  }

  await new Promise((r) => setTimeout(r, 700))
}

aliasDoc.meta = {
  ...(aliasDoc.meta || {}),
  version: 1,
  updatedAt: new Date().toISOString(),
  source: 'asurascans.com/browse + AniList search',
}

await writeFile(join(DATA, 'title-aliases.json'), JSON.stringify(aliasDoc, null, 2) + '\n')
await writeFile(join(DATA, 'manhwa.json'), JSON.stringify(manhwa, null, 2) + '\n')
await writeFile(
  join(ROOT, 'scripts', 'asura-anilist-alias-matches.json'),
  JSON.stringify({ found, stillMissing, stats: { found: found.length, stillMissing: stillMissing.length } }, null, 2),
)

console.log(
  JSON.stringify(
    {
      searched: missing.length,
      found: found.length,
      stillMissing: stillMissing.length,
      foundSample: found.slice(0, 30),
      stillMissingSample: stillMissing.slice(0, 20),
    },
    null,
    2,
  ),
)
