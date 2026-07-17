/**
 * Sync game data from ETL outputs into src/data for the Vite app.
 *
 * Sources (topN from catalog.config.json):
 *   manhwadle-etl/output/top-{topN}.json
 *   manhwadle-etl/output/storyDescriptionBlurb.json
 *
 * Writes:
 *   src/data/manhwa.json                  (full top-N pool + nested characters)
 *   src/data/storyDescriptionBlurb.json   (authored t0/t1 ladder)
 *
 * Usage: node scripts/sync-game-data.mjs
 *
 * Note: Summary mode still filters to titles with blurbs at runtime.
 * Cover/Character use the full synced catalog.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCatalogConfig, topExportFileName } from './catalog-config.mjs'
import { hasRealCharacterImage } from './lib/character-image.mjs'
import { parsePublisher } from './lib/publisher.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ETL_OUT = join(ROOT, 'manhwadle-etl', 'output')
const DATA_DIR = join(ROOT, 'src', 'data')

const TAG_MIN_RANK = 60
const ROLE_ORDER = { MAIN: 0, SUPPORTING: 1, BACKGROUND: 2 }

const NAMED_ENTITIES = {
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&rdquo;': '"',
  '&ldquo;': '"',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
}

function stripHtml(text) {
  if (text == null || text === '') return null
  let out = String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')

  for (const [entity, value] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(value)
  }

  out = out
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return out.length > 0 ? out : null
}

function mapStatus(status) {
  switch (status) {
    case 'RELEASING':
      return 'Ongoing'
    case 'FINISHED':
      return 'Completed'
    case 'HIATUS':
      return 'Hiatus'
    case 'CANCELLED':
      return 'Cancelled'
    case 'NOT_YET_RELEASED':
      return 'Not yet released'
    case 'Ongoing':
    case 'Completed':
    case 'Hiatus':
    case 'Cancelled':
    case 'Not yet released':
      return status
    default:
      return status ?? 'Unknown'
  }
}

const EPITHET =
  /\b(bastard|dancer|hunter|emperor|poisoner|slaughterer|crew|mobster|sunfish|mad cow|king|queen|prince|princess|duke|duchess|marquis|count|baron|lady|lord|captain|boss|god|spirit|intermediate|saintess|emperor|empress|woman with|man with|gongjak|hujak)\b/i

const RR_TOKEN_END =
  /(?:seu|teu|teun|peu|neu|oeo|lleu|beul|keul|reul|jeu|aseu|bereu|onteu|rollang|beullaim|teumoeo)$/i

function looksLikeBrokenRomanization(name) {
  const n = name.trim()
  if (!n) return false
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.some((part, i) => i > 0 && part.toLowerCase() === parts[i - 1].toLowerCase())) {
    return true
  }
  const euTokens = parts.filter((part) => /eu$/i.test(part)).length
  if (euTokens >= 2) return true
  if (parts.length === 1 && RR_TOKEN_END.test(parts[0])) return true
  if (parts.length >= 2 && parts.some((part) => RR_TOKEN_END.test(part))) return true
  return false
}

function looksLikeLatinPersonalName(name) {
  const n = name.trim()
  if (!n) return false
  if (/[\uac00-\ud7af]/.test(n)) return false
  if (!/^[A-Za-zÀ-ÿ\s.'’\-]+$/.test(n)) return false
  if (EPITHET.test(n)) return false
  if (/['']s\b/i.test(n)) return false
  if (n.split(/\s+/).length > 4) return false
  return true
}

function scoreLatinName(name) {
  let score = 0
  if (!looksLikeBrokenRomanization(name)) score += 50
  const words = name.trim().split(/\s+/).length
  if (words >= 1 && words <= 3) score += 20
  if (/^[A-Z]/.test(name)) score += 2
  score += Math.min(name.length, 24)
  return score
}

function pickPreferredCharacterFull(full, alternatives) {
  const trimmedFull = full?.trim() || null
  const alts = alternatives.map((a) => String(a).trim()).filter(Boolean)
  const latinAlts = alts.filter(looksLikeLatinPersonalName)
  if (!trimmedFull) {
    return latinAlts.sort((a, b) => scoreLatinName(b) - scoreLatinName(a))[0] || null
  }
  if (!looksLikeBrokenRomanization(trimmedFull)) return trimmedFull
  const bestAlt = latinAlts
    .filter((a) => a.toLowerCase() !== trimmedFull.toLowerCase())
    .sort((a, b) => scoreLatinName(b) - scoreLatinName(a))[0]
  return bestAlt || trimmedFull
}

function normalizeNameKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/gi, '')
}

/** Seol Kang ↔ Kang Seol for two-token Latin names. */
function withNameOrderAliases(name) {
  const full = name.full?.trim().replace(/\s+/g, ' ') || null
  const alternatives = (name.alternative || []).map((a) => String(a).trim()).filter(Boolean)
  if (!full) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }
  const parts = full.split(/\s+/)
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’\-]*$/.test(p))) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }
  const swapped = `${parts[1]} ${parts[0]}`
  const swappedKey = normalizeNameKey(swapped)
  if (!swappedKey || swappedKey === normalizeNameKey(full)) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }
  if (alternatives.some((alt) => normalizeNameKey(alt) === swappedKey)) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }
  return {
    full,
    native: name.native?.trim() || null,
    alternative: [...alternatives, swapped],
  }
}

function normalizeCharacterNameFields(name) {
  const originalFull = name.full?.trim() || null
  const alternatives = (name.alternative || []).map((a) => String(a).trim()).filter(Boolean)
  const preferred = pickPreferredCharacterFull(originalFull, alternatives)
  if (!preferred || preferred === originalFull) {
    return withNameOrderAliases({
      full: originalFull,
      native: name.native?.trim() || null,
      alternative: alternatives,
    })
  }
  const nextAlts = [...alternatives]
  if (originalFull && !nextAlts.some((a) => a.toLowerCase() === originalFull.toLowerCase())) {
    nextAlts.push(originalFull)
  }
  return withNameOrderAliases({
    full: preferred,
    native: name.native?.trim() || null,
    alternative: nextAlts.filter((a) => a.toLowerCase() !== preferred.toLowerCase()),
  })
}

function toGameCharacter(char, role) {
  const originalFull = char.name?.full?.trim() || null
  const alternatives = Array.isArray(char.name?.alternative)
    ? char.name.alternative.map((a) => String(a).trim()).filter(Boolean)
    : []
  const name = normalizeCharacterNameFields({
    full: originalFull,
    native: char.name?.native?.trim() || null,
    alternative: alternatives,
  })

  return {
    id: char.id,
    role: role || 'BACKGROUND',
    name,
    description: stripHtml(char.description),
    image: {
      large: char.image?.large || null,
      medium: char.image?.medium || null,
    },
    siteUrl: char.siteUrl || null,
    favourites: char.favourites ?? null,
    // Default: every character can be used for Character-mode guesses
    useForGuess: true,
  }
}

function attachCharacters(entry, characterById, appearancesByManhwa) {
  const apps = appearancesByManhwa.get(entry.id) || []
  const seen = new Set()
  const characters = []

  for (const app of apps) {
    if (seen.has(app.characterId)) continue
    const char = characterById.get(app.characterId)
    if (!char || !hasRealCharacterImage(char)) continue
    seen.add(app.characterId)
    characters.push(toGameCharacter(char, app.role))
  }

  // Fallback: characterIds list if appearances missing
  if (characters.length === 0 && Array.isArray(entry.characterIds)) {
    for (const id of entry.characterIds) {
      const char = characterById.get(id)
      if (!char || seen.has(id) || !hasRealCharacterImage(char)) continue
      seen.add(id)
      characters.push(toGameCharacter(char, 'BACKGROUND'))
    }
  }

  characters.sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
    if (roleDiff !== 0) return roleDiff
    // Keep AniList RELEVANCE order from appearances (insertion order).
    // Favourites ranking often elevates popular co-leads over the POV lead.
    return 0
  })

  return characters
}

function toGameManhwa(entry, characterById, appearancesByManhwa) {
  const titles = entry.titles || {}
  const tags = Array.isArray(entry.tags)
    ? entry.tags
        .filter((t) => {
          if (typeof t === 'string') return true
          return !t.isMediaSpoiler && (t.rank ?? 0) >= TAG_MIN_RANK
        })
        .map((t) => (typeof t === 'string' ? t : t.name))
        .filter(Boolean)
    : []

  const synonyms = Array.isArray(entry.aliases)
    ? entry.aliases
    : Array.isArray(entry.synonyms)
      ? entry.synonyms
      : []

  return {
    id: entry.id,
    idMal: entry.idMal ?? null,
    title: {
      english: titles.english ?? (typeof entry.title === 'string' ? entry.title : null),
      romaji: titles.romaji ?? null,
      native: titles.native ?? null,
    },
    synonyms,
    description: entry.description ?? '',
    genres: Array.isArray(entry.genres) ? entry.genres : [],
    tags,
    status: mapStatus(entry.status),
    publisher: parsePublisher(entry.description ?? ''),
    startDate: {
      year: entry.startYear ?? entry.startDate?.year ?? null,
      month: entry.startDate?.month ?? null,
      day: entry.startDate?.day ?? null,
    },
    coverImage:
      (typeof entry.coverImage === 'string'
        ? entry.coverImage
        : entry.coverImage?.large || entry.coverImage?.extraLarge) || null,
    siteUrl: entry.siteUrl || `https://anilist.co/manga/${entry.id}`,
    characters: attachCharacters(entry, characterById, appearancesByManhwa),
  }
}

async function loadTitleAliases() {
  try {
    const raw = await readFile(join(DATA_DIR, 'title-aliases.json'), 'utf8')
    const doc = JSON.parse(raw)
    return doc.aliases && typeof doc.aliases === 'object' ? doc.aliases : {}
  } catch {
    return {}
  }
}

async function loadCharacterAliases() {
  try {
    const raw = await readFile(join(DATA_DIR, 'character-aliases.json'), 'utf8')
    const doc = JSON.parse(raw)
    return doc.aliases && typeof doc.aliases === 'object' ? doc.aliases : {}
  } catch {
    return {}
  }
}

function mergeTitleAliases(pool, aliasMap) {
  let touched = 0
  for (const m of pool) {
    const extra = aliasMap[String(m.id)]
    if (!Array.isArray(extra) || extra.length === 0) continue
    const syn = new Set(m.synonyms || [])
    const before = syn.size
    for (const a of extra) {
      if (a && String(a).trim()) syn.add(String(a).trim())
    }
    if (syn.size > before) {
      m.synonyms = [...syn]
      touched += 1
    }
  }
  return touched
}

/** Merge curated extras into each character's alternative list (case-insensitive dedupe). */
function mergeCharacterAliases(pool, aliasMap) {
  let touched = 0
  for (const m of pool) {
    for (const character of m.characters || []) {
      const extra = aliasMap[String(character.id)]
      if (!Array.isArray(extra) || extra.length === 0) continue
      const fullKey = (character.name?.full || '').trim().toLowerCase()
      const alts = [...(character.name?.alternative || [])]
      const seen = new Set(alts.map((a) => a.trim().toLowerCase()).filter(Boolean))
      if (fullKey) seen.add(fullKey)
      let added = 0
      for (const raw of extra) {
        const a = String(raw || '').trim()
        if (!a) continue
        const key = a.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        alts.push(a)
        added += 1
      }
      if (added > 0) {
        character.name.alternative = alts
        touched += 1
      }
    }
  }
  return touched
}

const { topN, excludeIds } = await loadCatalogConfig()
const topFileName = topExportFileName(topN)
const topPath = join(ETL_OUT, topFileName)
const excludeSet = new Set(excludeIds)

const topDoc = JSON.parse(await readFile(topPath, 'utf8'))
const blurbsPath = join(ETL_OUT, 'storyDescriptionBlurb.json')
const blurbsDoc = JSON.parse(await readFile(blurbsPath, 'utf8'))

const characterById = new Map((topDoc.characters || []).map((c) => [c.id, c]))
const appearancesByManhwa = new Map()
for (const app of topDoc.appearances || []) {
  if (!appearancesByManhwa.has(app.manhwaId)) appearancesByManhwa.set(app.manhwaId, [])
  appearancesByManhwa.get(app.manhwaId).push(app)
}

const blurbEntries = (blurbsDoc.entries || []).filter((e) => !excludeSet.has(e.manhwaId))
const blurbIds = new Set(blurbEntries.map((e) => e.manhwaId))
// Full top-N catalog for Cover/Character + autocomplete; Summary filters blurbs in-game.
const pool = (topDoc.manhwa || [])
  .filter((m) => !excludeSet.has(m.id))
  .map((m) => toGameManhwa(m, characterById, appearancesByManhwa))

if (pool.length === 0) {
  throw new Error(`No manhwa in ${topFileName}`)
}

const withBlurbs = pool.filter((m) => blurbIds.has(m.id)).length
const withChars = pool.filter((m) => m.characters.length > 0).length
const totalChars = pool.reduce((sum, m) => sum + m.characters.length, 0)
const skippedNoImage = [...characterById.values()].filter((c) => !hasRealCharacterImage(c)).length
const sample = pool[0]

await mkdir(DATA_DIR, { recursive: true })
const aliasMap = await loadTitleAliases()
const aliasTouched = mergeTitleAliases(pool, aliasMap)
const characterAliasMap = await loadCharacterAliases()
const characterAliasTouched = mergeCharacterAliases(pool, characterAliasMap)
await writeFile(join(DATA_DIR, 'manhwa.json'), JSON.stringify(pool, null, 2) + '\n', 'utf8')
const blurbsOut = { ...blurbsDoc, entries: blurbEntries }
await writeFile(
  join(DATA_DIR, 'storyDescriptionBlurb.json'),
  JSON.stringify(blurbsOut, null, 2) + '\n',
  'utf8',
)

console.log(
  `Synced game data (catalog topN=${topN}, excluded=${excludeIds.length}):\n` +
    `  source: ${topFileName}\n` +
    `  manhwa.json: ${pool.length} titles (${withChars} with characters, ${totalChars} attached, ${withBlurbs} with blurbs)\n` +
    `  skipped characters with default/missing image: ${skippedNoImage}\n` +
    `  title-aliases merged into ${aliasTouched} titles\n` +
    `  character-aliases merged into ${characterAliasTouched} characters\n` +
    `  storyDescriptionBlurb.json: ${blurbEntries.length} entries` +
    (excludeIds.length ? ` (dropped ${excludeIds.length} excluded)` : '') +
    `\n` +
    `  sample #1 ${sample?.title?.english}: ${sample?.characters?.length ?? 0} chars` +
    (sample?.characters?.[0]
      ? ` (first ${sample.characters[0].role}: ${sample.characters[0].name.full})`
      : ''),
)
