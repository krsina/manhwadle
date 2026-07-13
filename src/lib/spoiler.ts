import type { Manhwa } from './anilist-types'
import { displayTitle } from './daily'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Collect all names that could spoil the answer if left in the summary */
export function collectSpoilNames(manhwa: Manhwa): string[] {
  const names = new Set<string>()
  const candidates = [
    manhwa.title.english,
    manhwa.title.romaji,
    manhwa.title.native,
    ...manhwa.synonyms,
  ]

  for (const raw of candidates) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (trimmed.length < 2) continue
    names.add(trimmed)
  }

  return [...names].sort((a, b) => b.length - a.length)
}

/** Remove titles/aliases from the daily summary so the answer isn't leaked */
export function scrubSummary(manhwa: Manhwa): string {
  let text = manhwa.description?.trim() || 'No summary available for today’s manhwa.'
  const names = collectSpoilNames(manhwa)

  for (const name of names) {
    const pattern = new RegExp(escapeRegExp(name), 'gi')
    text = text.replace(pattern, '___')
  }

  // Collapse leftover spacing around blanks
  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()

  // Safety: never leave the primary display title visible
  const primary = displayTitle(manhwa)
  if (primary && text.toLowerCase().includes(primary.toLowerCase())) {
    text = text.replace(new RegExp(escapeRegExp(primary), 'gi'), '___')
  }

  return text
}
