import type { Manhwa, ManhwaCharacter } from './anilist-types'
import { displayTitle } from './daily'

export interface SearchHit {
  manhwa: Manhwa
  /** Always the English (or primary) title — never an alias */
  label: string
  /** True when the query matched via an alias rather than the display title */
  matchedAlias: boolean
}

export interface CharacterSearchHit {
  character: ManhwaCharacter
  /** Name that matched the query (primary or alias) — shown in the list */
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

function englishLabel(manhwa: Manhwa): string {
  return manhwa.title.english?.trim() || displayTitle(manhwa)
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

function characterNames(character: ManhwaCharacter): string[] {
  return [
    character.name.full,
    character.name.native,
    ...(character.name.alternative || []),
  ].filter((n): n is string => Boolean(n?.trim()))
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

/**
 * Ranked autocomplete against English titles and all aliases.
 * Results always show the English name, even when an alias matched.
 */
export function searchManhwa(pool: Manhwa[], query: string, limit = 8): SearchHit[] {
  const q = normalize(query)
  if (!q) return []

  const scored: Array<SearchHit & { score: number }> = []

  for (const manhwa of pool) {
    const label = englishLabel(manhwa)
    let bestScore = Infinity
    let matchedAlias = false

    for (const name of allNames(manhwa)) {
      const score = scoreName(name, q)
      if (score < bestScore) {
        bestScore = score
        matchedAlias = normalize(name) !== normalize(label)
      } else if (score === bestScore && score < Infinity) {
        // Prefer treating it as a primary-title match when scores tie
        if (normalize(name) === normalize(label)) {
          matchedAlias = false
        }
      }
    }

    if (bestScore < Infinity) {
      scored.push({
        manhwa,
        label,
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
 * Ranked autocomplete against character names / aliases from a cast list.
 * List label is the specific name that matched the query (alias only when typed).
 * Duplicate labels are collapsed — bonus matching is by name, not AniList id.
 */
export function searchCharacters(
  characters: ManhwaCharacter[],
  query: string,
  limit = 10,
): CharacterSearchHit[] {
  const q = normalize(query)
  if (!q) return []

  const scored: Array<CharacterSearchHit & { score: number }> = []

  for (const character of characters) {
    let bestScore = Infinity
    let matchedName = ''

    for (const name of characterNames(character)) {
      const score = scoreName(name, q)
      if (score < bestScore) {
        bestScore = score
        matchedName = name.trim()
      }
    }

    if (bestScore < Infinity && matchedName) {
      scored.push({
        character,
        label: matchedName,
        score: bestScore,
      })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.label.localeCompare(b.label)
  })

  const seenLabels = new Set<string>()
  const unique: CharacterSearchHit[] = []
  for (const hit of scored) {
    const key = normalize(hit.label)
    if (!key || seenLabels.has(key)) continue
    seenLabels.add(key)
    unique.push({ character: hit.character, label: hit.label })
    if (unique.length >= limit) break
  }

  return unique
}

export function findById(pool: Manhwa[], id: number): Manhwa | undefined {
  return pool.find((m) => m.id === id)
}
