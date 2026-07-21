import type { Manhwa, ManhwaCharacter } from './anilist-types'
import { displayTitle } from './daily'
import {
  nameOrderVariants,
  namesMatch,
  normalizeSearchKey,
  normalizeSearchKeys,
  scoreSearchKey,
  scoreStrongSearchKey,
} from './nameMatch'

export interface SearchHit {
  manhwa: Manhwa
  /** Best-matching title form for the query (English or alias) */
  label: string
  /** True when the query matched via an alias rather than the display title */
  matchedAlias: boolean
}

export interface CharacterSearchHit {
  character: ManhwaCharacter
  /** Name that matched the query (primary or alias) — shown in the list */
  label: string
}

/** Minimum normalized query length before character autocomplete shows results. */
export const CHARACTER_SEARCH_MIN_QUERY_LENGTH = 2

/** Max rows shown in the character autocomplete dropdown. */
export const CHARACTER_SEARCH_LIMIT = 25

/**
 * Apply leftover-length ranking only once the query is this long.
 * Shorter queries stay alphabetical so early prefixes stay less spoilery.
 */
export const CHARACTER_SEARCH_LEFTOVER_RANK_MIN_LENGTH = 4

/** Hangul syllables — AniList often packs these into Latin aliases in parentheses. */
const HANGUL = /[\uac00-\ud7af]/

/** True when the typed query is Latin-script (no Hangul). */
function isLatinScriptQuery(query: string): boolean {
  const t = query.trim()
  if (!t) return false
  return !HANGUL.test(t)
}

/**
 * Dropdown labels should mirror what the player typed. When the query is Latin,
 * strip Hangul (and empty parentheses) from AniList's mixed aliases like
 * `Seo-Jin Han (한서진)` → `Seo-Jin Han`. Matching still uses the raw name.
 */
export function latinFriendlyDisplayLabel(label: string, query: string): string {
  const trimmed = label.trim().replace(/\s+/g, ' ')
  if (!trimmed || !isLatinScriptQuery(query)) return trimmed
  if (!HANGUL.test(trimmed)) return trimmed

  const cleaned = trimmed
    .replace(/\(\s*[\uac00-\ud7af\s]+\s*\)/g, '')
    .replace(HANGUL, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()

  return cleaned || trimmed
}

function allNames(manhwa: Manhwa): string[] {
  return [
    manhwa.title.english,
    manhwa.title.romaji,
    manhwa.title.native,
    ...manhwa.synonyms,
  ].filter((n): n is string => Boolean(n && n.trim()))
}

function englishLabel(manhwa: Manhwa): string {
  return manhwa.title.english?.trim() || displayTitle(manhwa)
}

/**
 * Searchable display forms for a character: primary, native, alternatives,
 * plus given/family order flips. Deduped by compact key.
 */
function characterNames(character: ManhwaCharacter): string[] {
  const base = [
    character.name.full,
    character.name.native,
    ...(character.name.alternative || []),
  ].filter((n): n is string => Boolean(n?.trim()))

  const seen = new Set<string>()
  const names: string[] = []
  for (const name of base) {
    for (const variant of nameOrderVariants(name)) {
      const key = normalizeSearchKey(variant)
      if (!key || seen.has(key)) continue
      seen.add(key)
      names.push(variant)
    }
  }
  return names
}

/** Unique cast members across a manhwa pool (by AniList character id). */
export function collectCharacters(pool: Manhwa[]): ManhwaCharacter[] {
  const byId = new Map<number, ManhwaCharacter>()
  for (const manhwa of pool) {
    for (const character of manhwa.characters || []) {
      if (!byId.has(character.id)) byId.set(character.id, character)
    }
  }
  return [...byId.values()]
}

/** Minimum normalized query length before title search allows mid-string hits. */
export const MANHWA_SEARCH_SUBSTRING_MIN_LENGTH = 4

/** Shortest leftover after a query prefix/exact hit among a name's compact keys. */
function bestKeyLeftover(name: string, queryKey: string): number {
  let best = Infinity
  for (const key of normalizeSearchKeys(name)) {
    if (key === queryKey || key.startsWith(queryKey)) {
      best = Math.min(best, Math.max(0, key.length - queryKey.length))
    }
  }
  return best
}

/**
 * True when the unmatched suffix is only a sequel shorthand (2, 3, NW, Season 3…).
 * Prefer the real English title over these in dropdown labels.
 */
function isThinSequelAlias(name: string, queryKey: string): boolean {
  for (const key of normalizeSearchKeys(name)) {
    if (!key.startsWith(queryKey)) continue
    const rest = key.slice(queryKey.length)
    if (!rest) continue
    if (/^(\d+|nw|newwaves|season\d+|part\d+)$/i.test(rest)) return true
  }
  return false
}

/**
 * Ranked autocomplete against English titles and all aliases.
 * Dropdown label mirrors the best-matching form (alias when that scored best).
 *
 * Short queries (under {@link MANHWA_SEARCH_SUBSTRING_MIN_LENGTH}) match exact /
 * prefix only so single letters don't flood the list with mid-title hits.
 * Longer queries also allow substring matches for mid-word recall.
 */
export function searchManhwa(pool: Manhwa[], query: string, limit = 8): SearchHit[] {
  const q = normalizeSearchKey(query)
  if (!q) return []

  const allowSubstring = q.length >= MANHWA_SEARCH_SUBSTRING_MIN_LENGTH
  const scored: Array<SearchHit & { score: number }> = []

  for (const manhwa of pool) {
    const primary = englishLabel(manhwa)
    let bestScore = Infinity
    let bestLabel = primary
    let matchedAlias = false
    let bestLeftover = Infinity

    for (const name of allNames(manhwa)) {
      const score = scoreSearchKey(name, q, { allowSubstring })
      if (score === Infinity) continue

      const label = name.trim() || primary
      const leftover = bestKeyLeftover(name, q)
      const isPrimary = namesMatch(name, primary)

      if (score < bestScore) {
        bestScore = score
        bestLabel = label
        matchedAlias = !isPrimary
        bestLeftover = leftover
        continue
      }

      if (score !== bestScore) continue

      const candidateThin = !isPrimary && isThinSequelAlias(name, q)
      const bestThin = matchedAlias && isThinSequelAlias(bestLabel, q)

      // Keep "The Breaker: Eternal Force" over the shorter "The Breaker 3" alias.
      if (isPrimary && bestThin) {
        bestLabel = primary
        matchedAlias = false
        bestLeftover = leftover
        continue
      }
      if (candidateThin && !matchedAlias) {
        continue
      }

      // Same rank: prefer the form that leaves less unmatched title after the query
      // ("doctor" → "Doctor's Rebirth" over the longer primary "Doctor, Live Again").
      if (leftover < bestLeftover) {
        bestLabel = label
        matchedAlias = !isPrimary
        bestLeftover = leftover
        continue
      }
      if (leftover > bestLeftover) continue

      if (isPrimary) {
        bestLabel = primary
        matchedAlias = false
      } else if (
        HANGUL.test(bestLabel) &&
        !HANGUL.test(name) &&
        !namesMatch(bestLabel, primary)
      ) {
        // Prefer a Latin-only alias over a mixed Hangul form at the same score
        bestLabel = label
      }
    }

    if (bestScore < Infinity) {
      scored.push({
        manhwa,
        label: latinFriendlyDisplayLabel(bestLabel, query),
        matchedAlias,
        score: bestScore,
      })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.label.localeCompare(b.label)
  })

  return scored.slice(0, limit).map(({ manhwa, label, matchedAlias }) => ({
    manhwa,
    label,
    matchedAlias,
  }))
}

/**
 * Pick the display label that best mirrors what the user typed among strong hits.
 * Prefers exact key match, then the form whose compact key prefixes the query.
 */
function pickTypedMirrorLabel(
  names: string[],
  queryKey: string,
): { label: string; score: number } | null {
  let bestScore = Infinity
  let bestLabel = ''

  for (const name of names) {
    const score = scoreStrongSearchKey(name, queryKey)
    if (score > bestScore) continue

    if (score < bestScore) {
      bestScore = score
      bestLabel = name.trim()
      continue
    }

    // Tie-break: prefer Hangul-free, then shorter label, then stable alpha order.
    const cur = name.trim()
    if (!bestLabel) {
      bestLabel = cur
      continue
    }
    const bestHangul = HANGUL.test(bestLabel)
    const curHangul = HANGUL.test(cur)
    if (bestHangul !== curHangul) {
      if (!curHangul) bestLabel = cur
      continue
    }
    if (cur.length !== bestLabel.length) {
      if (cur.length < bestLabel.length) bestLabel = cur
      continue
    }
    if (cur.localeCompare(bestLabel) < 0) bestLabel = cur
  }

  if (bestScore === Infinity || !bestLabel) return null
  return { label: bestLabel, score: bestScore }
}

/**
 * Ranked autocomplete against character names / aliases from a cast list.
 *
 * - One row per character (never one row per alias).
 * - Label mirrors the typed form on strong matches ("Kang" → "Kang Seol").
 * - Strong match only: exact or prefix, min query length 2. Substring hits are hidden.
 * - Cap defaults to 25. Queries under 4 chars sort alphabetically; 4+ prefer
 *   shorter leftover length so `jinu` ranks nearer Jin-U Seong without boosting `ji`.
 */
export function searchCharacters(
  characters: ManhwaCharacter[],
  query: string,
  limit = CHARACTER_SEARCH_LIMIT,
): CharacterSearchHit[] {
  const q = normalizeSearchKey(query)
  if (!q || q.length < CHARACTER_SEARCH_MIN_QUERY_LENGTH) return []

  const useLeftoverRank = q.length >= CHARACTER_SEARCH_LEFTOVER_RANK_MIN_LENGTH
  const scored: Array<CharacterSearchHit & { score: number; key: string }> = []

  for (const character of characters) {
    const picked = pickTypedMirrorLabel(characterNames(character), q)
    if (!picked) continue
    const label = latinFriendlyDisplayLabel(picked.label, query)
    scored.push({
      character,
      label,
      score: picked.score,
      key: normalizeSearchKey(label),
    })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (useLeftoverRank) {
      const leftoverA = Math.max(0, a.key.length - q.length)
      const leftoverB = Math.max(0, b.key.length - q.length)
      if (leftoverA !== leftoverB) return leftoverA - leftoverB
      const wordsA = a.label.trim().split(/\s+/).length
      const wordsB = b.label.trim().split(/\s+/).length
      if (wordsA !== wordsB) return wordsA - wordsB
    }
    return a.label.localeCompare(b.label)
  })

  const seenIds = new Set<number>()
  const unique: CharacterSearchHit[] = []
  for (const hit of scored) {
    if (seenIds.has(hit.character.id)) continue
    seenIds.add(hit.character.id)
    unique.push({ character: hit.character, label: hit.label })
    if (unique.length >= limit) break
  }

  return unique
}

export function findById(pool: Manhwa[], id: number): Manhwa | undefined {
  return pool.find((m) => m.id === id)
}
