import type { Manhwa } from './anilist-types'
import { displayTitle } from './daily'

export interface SearchHit {
  manhwa: Manhwa
  /** Label shown in autocomplete — matched alias when query hit an alias */
  label: string
  /** True when label is not the primary display title */
  matchedAlias: boolean
}

function allNames(manhwa: Manhwa): string[] {
  return [
    manhwa.title.english,
    manhwa.title.romaji,
    manhwa.title.native,
    ...manhwa.synonyms,
  ].filter((n): n is string => Boolean(n && n.trim()))
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function scoreName(name: string, query: string): number {
  const n = normalize(name)
  if (!n) return Infinity
  if (n === query) return 0
  if (n.startsWith(query)) return 1
  if (n.includes(query)) return 2
  return Infinity
}

/**
 * Ranked autocomplete against English titles and all aliases.
 * When the query matches an alias better (or instead), that alias is the label.
 */
export function searchManhwa(pool: Manhwa[], query: string, limit = 8): SearchHit[] {
  const q = normalize(query)
  if (!q) return []

  const scored: Array<SearchHit & { score: number }> = []

  for (const manhwa of pool) {
    const primary = displayTitle(manhwa)
    let bestScore = Infinity
    let bestLabel = primary

    for (const name of allNames(manhwa)) {
      const score = scoreName(name, q)
      if (score < bestScore) {
        bestScore = score
        bestLabel = name.trim()
      } else if (score === bestScore && score < Infinity) {
        // Prefer the primary title when scores tie
        if (normalize(name) === normalize(primary)) {
          bestLabel = primary
        }
      }
    }

    if (bestScore < Infinity) {
      scored.push({
        manhwa,
        label: bestLabel,
        matchedAlias: normalize(bestLabel) !== normalize(primary),
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

export function findById(pool: Manhwa[], id: number): Manhwa | undefined {
  return pool.find((m) => m.id === id)
}
