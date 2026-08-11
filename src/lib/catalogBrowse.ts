import type { Manhwa } from './anilist-types'
import { displayTitle } from './daily'
import {
  looseSearchKey,
  normalizeSearchKey,
  scoreSearchKey,
  searchTokens,
} from './nameMatch'
import { MANHWA_SEARCH_SUBSTRING_MIN_LENGTH } from './search'

/** Shared browsing helpers for catalog grids (database page, list builder). */
export function catalogNames(manhwa: Manhwa): string[] {
  return [
    manhwa.title.english,
    manhwa.title.romaji,
    manhwa.title.native,
    ...manhwa.synonyms,
  ].filter((name): name is string => Boolean(name && name.trim()))
}

export function matchesCatalogQuery(manhwa: Manhwa, query: string): boolean {
  const key = normalizeSearchKey(query)
  const loose = looseSearchKey(query)
  const tokens = searchTokens(query)
  if (!key && tokens.length === 0) return true
  const allowSubstring = key.length >= MANHWA_SEARCH_SUBSTRING_MIN_LENGTH
  return catalogNames(manhwa).some(
    (name) =>
      scoreSearchKey(name, key, {
        allowSubstring,
        looseQueryKey: loose || undefined,
        queryTokens: tokens,
      }) < Infinity,
  )
}

export function catalogRank(manhwa: Manhwa): number | null {
  return manhwa.rank && manhwa.rank > 0 ? manhwa.rank : null
}

export function sortCatalogByRank(pool: Manhwa[]): Manhwa[] {
  return [...pool].sort((left, right) => {
    const rankLeft = catalogRank(left) ?? Number.MAX_SAFE_INTEGER
    const rankRight = catalogRank(right) ?? Number.MAX_SAFE_INTEGER
    if (rankLeft !== rankRight) return rankLeft - rankRight
    return displayTitle(left).localeCompare(displayTitle(right))
  })
}

export function catalogTileMeta(manhwa: Manhwa): string[] {
  const year = manhwa.startDate?.year
  return [manhwa.publisher || null, year ? String(year) : null].filter(
    (part): part is string => Boolean(part),
  )
}
