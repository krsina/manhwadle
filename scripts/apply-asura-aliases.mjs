/**
 * Match Asura browse "missing" titles to top-N pool entries and add synonyms.
 *
 * Writes:
 *   scripts/asura-alias-matches.json   (review: accepted + rejected)
 *   src/data/title-aliases.json        (persistent id → extra synonyms)
 *   updates src/data/manhwa.json synonyms in place
 *
 * sync-game-data.mjs merges title-aliases.json on future syncs.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCatalogConfig, topExportFileName } from './catalog-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data')

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripThe(s) {
  const n = norm(s)
  return n.startsWith('the ') ? n.slice(4) : n
}

function tokens(s) {
  return stripThe(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w))
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'into',
  'that',
  'this',
  'who',
  'was',
  'are',
  'his',
  'her',
  'its',
  'of',
  'to',
  'in',
  'on',
  'a',
  'an',
  'is',
  'as',
  'by',
  'my',
  'me',
  'i',
  'becomes',
  'become',
  'being',
])

function jaccard(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

function containment(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / A.size
}

/** Hand-curated Asura title → AniList id (high-confidence renames) */
const CURATED = [
  { asura: 'Star Instructor, Master Baek', id: 142352 }, // Best Teacher Baek
  { asura: 'Solo Farming In The Tower', id: 166658 }, // The Top Dungeon Farmer
  { asura: 'Boundless Necromancer', id: 159439 }, // Boundless Ascension / The Boundless Necromancer
]

async function main() {
  const coverage = JSON.parse(
    await readFile(join(ROOT, 'scripts', 'asura-coverage-report.json'), 'utf8'),
  )
  const manhwa = JSON.parse(await readFile(join(DATA, 'manhwa.json'), 'utf8'))
  const byId = new Map(manhwa.map((m) => [m.id, m]))

  // Also index top export for ids that might differ slightly
  const { topN } = await loadCatalogConfig()
  const top = JSON.parse(
    await readFile(
      join(ROOT, 'manhwadle-etl', 'output', topExportFileName(topN)),
      'utf8',
    ),
  )

  const candidates = manhwa.map((m) => {
    const names = [
      m.title?.english,
      m.title?.romaji,
      m.title?.native,
      ...(m.synonyms || []),
    ].filter(Boolean)
    return {
      id: m.id,
      names,
      tokens: names.flatMap((n) => tokens(n)),
      primary: m.title?.english || m.title?.romaji || String(m.id),
      popularity: null,
      rank: null,
    }
  })

  // attach popularity/rank from top export when present
  const topById = new Map((top.manhwa || []).map((m) => [m.id, m]))
  for (const c of candidates) {
    const t = topById.get(c.id)
    if (t) {
      c.popularity = t.popularity
      c.rank = t.rank
    }
  }

  const missing = (coverage.missingTitles || []).filter(
    (t) => t && !/^(browse|status|dmca|privacy policy)$/i.test(t.trim()),
  )

  // Resolve curated ids by title hint if needed
  for (const row of CURATED) {
    if (row.id) continue
    if (!row.titleHint) continue
    const hit = manhwa.find((m) =>
      [m.title?.english, m.title?.romaji, ...(m.synonyms || [])]
        .filter(Boolean)
        .some((n) => stripThe(n) === stripThe(row.titleHint)),
    )
    if (hit) row.id = hit.id
  }

  // Best Teacher Baek lookup for Star Instructor
  if (!CURATED[0].id) {
    const hit = manhwa.find((m) =>
      norm(m.title?.english || '').includes('best teacher baek'),
    )
    if (hit) CURATED[0].id = hit.id
  }

  const accepted = []
  const rejected = []
  const curatedApplied = []

  for (const row of CURATED) {
    if (!row.id || !byId.has(row.id)) {
      rejected.push({ asuraTitle: row.asura, reason: 'curated-id-not-in-pool' })
      continue
    }
    curatedApplied.push({
      asuraTitle: row.asura,
      anilistId: row.id,
      anilistTitle: byId.get(row.id).title?.english,
      method: 'curated',
      score: 1,
    })
  }

  for (const asuraTitle of missing) {
    if (curatedApplied.some((a) => norm(a.asuraTitle) === norm(asuraTitle))) continue

    const asuraTok = tokens(asuraTitle)
    const asuraKey = stripThe(asuraTitle)

    let best = null
    for (const c of candidates) {
      // exact / the-stripped exact against any name
      let exact = false
      for (const n of c.names) {
        if (stripThe(n) === asuraKey) {
          exact = true
          break
        }
      }
      const jac = jaccard(asuraTok, c.tokens)
      const cont = containment(asuraTok, tokens(c.primary))
      const contAny = Math.max(
        cont,
        ...c.names.map((n) => containment(asuraTok, tokens(n))),
      )
      const score = exact ? 1 : Math.max(jac, contAny * 0.95)

      if (!best || score > best.score) {
        best = {
          asuraTitle,
          anilistId: c.id,
          anilistTitle: c.primary,
          rank: c.rank,
          popularity: c.popularity,
          score,
          exact,
          jac,
          contAny,
        }
      }
    }

    // High-confidence gates (avoid Solo Leveling false friends)
    const ok =
      best &&
      (best.exact ||
        (best.score >= 0.72 && best.jac >= 0.55 && asuraTok.length >= 2) ||
        (best.contAny >= 0.85 && asuraTok.length >= 3 && best.jac >= 0.45))

    if (ok) accepted.push({ ...best, method: best.exact ? 'exact' : 'fuzzy' })
    else
      rejected.push({
        asuraTitle,
        best: best
          ? {
              anilistId: best.anilistId,
              anilistTitle: best.anilistTitle,
              score: best.score,
              jac: best.jac,
              contAny: best.contAny,
            }
          : null,
        reason: 'low-confidence',
      })
  }

  const allAccepted = [...curatedApplied, ...accepted]

  // Dedupe: one asura title → one id; if conflicts keep higher score
  const byAsura = new Map()
  for (const row of allAccepted) {
    const k = norm(row.asuraTitle)
    const prev = byAsura.get(k)
    if (!prev || (row.score ?? 0) > (prev.score ?? 0)) byAsura.set(k, row)
  }
  const finalAccepted = [...byAsura.values()]

  // Build id → aliases map
  let existingAliases = {}
  try {
    existingAliases = JSON.parse(
      await readFile(join(DATA, 'title-aliases.json'), 'utf8'),
    )
  } catch {
    existingAliases = {}
  }

  const aliasDoc = {
    meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: 'asurascans.com/browse alias matching',
      notes: [
        'Extra synonyms keyed by AniList media id.',
        'Merged into manhwa.synonyms by sync-game-data.mjs and apply-title-aliases.mjs.',
      ],
    },
    aliases: { ...existingAliases.aliases },
  }

  let addedCount = 0
  for (const row of finalAccepted) {
    const idKey = String(row.anilistId)
    const list = new Set(aliasDoc.aliases[idKey] || [])
    const before = list.size
    list.add(row.asuraTitle)
    aliasDoc.aliases[idKey] = [...list].sort((a, b) => a.localeCompare(b))
    if (aliasDoc.aliases[idKey].length > before) addedCount++

    const m = byId.get(row.anilistId)
    if (m) {
      const syn = new Set(m.synonyms || [])
      syn.add(row.asuraTitle)
      m.synonyms = [...syn]
    }
  }

  await writeFile(join(DATA, 'title-aliases.json'), JSON.stringify(aliasDoc, null, 2) + '\n')
  await writeFile(join(DATA, 'manhwa.json'), JSON.stringify(manhwa, null, 2) + '\n')
  await writeFile(
    join(ROOT, 'scripts', 'asura-alias-matches.json'),
    JSON.stringify(
      {
        accepted: finalAccepted.sort((a, b) => a.asuraTitle.localeCompare(b.asuraTitle)),
        rejected: rejected.sort((a, b) => a.asuraTitle.localeCompare(b.asuraTitle)),
        stats: {
          missingInput: missing.length,
          accepted: finalAccepted.length,
          rejected: rejected.length,
          aliasEntriesTouched: addedCount,
        },
      },
      null,
      2,
    ),
  )

  console.log(
    JSON.stringify(
      {
        missingInput: missing.length,
        accepted: finalAccepted.length,
        rejected: rejected.length,
        aliasEntriesTouched: addedCount,
        acceptedSample: finalAccepted.slice(0, 25),
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
