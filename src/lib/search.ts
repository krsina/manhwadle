import type { Manhwa } from './anilist-types'
import { displayTitle } from './daily'

export interface SearchHit {
  manhwa: Manhwa
  /** Always the English/display title shown in the list */
  label: string
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

/**
 * Ranked autocomplete against English titles and all aliases.
 * Results always show the English/display title, never the matched alias text.
 */
export function searchManhwa(pool: Manhwa[], query: string, limit = 8): SearchHit[] {
  const q = normalize(query)
  if (!q) return []

  const scored: Array<SearchHit & { score: number }> = []

  for (const manhwa of pool) {
    const label = displayTitle(manhwa)
    let bestScore = Infinity

    for (const name of allNames(manhwa)) {
      const n = normalize(name)
      let score = Infinity
      if (n === q) score = 0
      else if (n.startsWith(q)) score = 1
      else if (n.includes(q)) score = 2

      if (score < bestScore) bestScore = score
    }

    // Prefer an exact/prefix hit on the display title when scores tie later
    const labelNorm = normalize(label)
    if (labelNorm === q) bestScore = Math.min(bestScore, 0)
    else if (labelNorm.startsWith(q)) bestScore = Math.min(bestScore, 1)

    if (bestScore < Infinity) {
      scored.push({ manhwa, label, score: bestScore })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.label.localeCompare(b.label)
  })

  return scored.slice(0, limit).map(({ manhwa, label }) => ({ manhwa, label }))
}

export function findById(pool: Manhwa[], id: number): Manhwa | undefined {
  return pool.find((m) => m.id === id)
}
