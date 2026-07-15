import type { Manhwa } from './anilist-types'

export type ReaderTaste = 'action' | 'romance' | 'both'

export type ManhwaTasteLane = 'action' | 'romance' | 'both'

export interface ReaderTasteOption {
  id: ReaderTaste
  label: string
  description: string
}

export const READER_TASTE_OPTIONS: ReaderTasteOption[] = [
  {
    id: 'action',
    label: 'Action & fantasy',
    description: 'Battles, regression, isekai, cultivation, and high-stakes adventures.',
  },
  {
    id: 'romance',
    label: 'Romance & drama',
    description: 'Slice of life, romance, school, villainess, and relationship-driven stories.',
  },
  {
    id: 'both',
    label: 'Both',
    description: 'Draw today’s puzzle from the full top-500 catalog.',
  },
]

const STORAGE_KEY = 'manhwadle:readerTaste'

const ACTION_GENRES = new Set([
  'Action',
  'Fantasy',
  'Adventure',
  'Thriller',
  'Horror',
  'Sports',
  'Sci-Fi',
])

const ROMANCE_GENRES = new Set(['Romance', 'Drama', 'Slice of Life'])

const ACTION_TAGS = new Set([
  'Martial Arts',
  'Isekai',
  'Reincarnation',
  'Revenge',
  'Dungeon',
  'Cultivation',
  'Gore',
  'Survival',
  'Swordplay',
  'Demons',
  'Super Power',
  'War',
  'Male Protagonist',
  'Anti-Hero',
  'Age Regression',
  'Virtual World',
  'Video Games',
  'Necromancy',
  'Wuxia',
])

const ROMANCE_TAGS = new Set([
  'Villainess',
  'Love Triangle',
  'School',
  'Royal Affairs',
  'Family Life',
  'Otome Game',
  'Female Protagonist',
  'Heterosexual',
  'Ojou-sama',
  'Yandere',
  'Coming of Age',
  'Found Family',
  'Work',
])

export function isReaderTaste(value: string): value is ReaderTaste {
  return value === 'action' || value === 'romance' || value === 'both'
}

export function loadReaderTaste(): ReaderTaste | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isReaderTaste(raw)) return raw
  } catch {
    /* ignore */
  }
  return null
}

export function saveReaderTaste(taste: ReaderTaste): void {
  try {
    localStorage.setItem(STORAGE_KEY, taste)
  } catch {
    /* ignore */
  }
}

export function readerTasteLabel(taste: ReaderTaste): string {
  return READER_TASTE_OPTIONS.find((option) => option.id === taste)?.label ?? taste
}

/** Short label for share cards: Action / Romance / Both */
export function readerTasteShareLabel(taste: ReaderTaste): string {
  switch (taste) {
    case 'action':
      return 'Action'
    case 'romance':
      return 'Romance'
    case 'both':
      return 'Both'
  }
}

function scoreSide(
  manhwa: Manhwa,
  genres: Set<string>,
  tags: Set<string>,
): number {
  let score = 0
  for (const genre of manhwa.genres || []) {
    if (genres.has(genre)) score += 3
  }
  for (const tag of manhwa.tags || []) {
    if (tags.has(tag)) score += 1
  }
  return score
}

/** Which focused lane(s) a title belongs to. Ties / weak scores → both lanes. */
export function classifyManhwaTaste(manhwa: Manhwa): ManhwaTasteLane {
  const action = scoreSide(manhwa, ACTION_GENRES, ACTION_TAGS)
  const romance = scoreSide(manhwa, ROMANCE_GENRES, ROMANCE_TAGS)

  if (action === 0 && romance === 0) return 'both'
  if (action === romance) return 'both'
  return action > romance ? 'action' : 'romance'
}

export function manhwaMatchesTaste(manhwa: Manhwa, taste: ReaderTaste): boolean {
  if (taste === 'both') return true
  const lane = classifyManhwaTaste(manhwa)
  return lane === taste || lane === 'both'
}

/**
 * Filter the daily answer pool by reader preference.
 * Empty focused pools fall back to the full catalog.
 */
export function filterPoolByTaste(pool: Manhwa[], taste: ReaderTaste): Manhwa[] {
  if (taste === 'both') return pool
  const filtered = pool.filter((manhwa) => manhwaMatchesTaste(manhwa, taste))
  return filtered.length > 0 ? filtered : pool
}

/** Append taste to a mode seed/storage prefix so tracks stay independent. */
export function withTastePrefix(basePrefix: string, taste: ReaderTaste): string {
  return `${basePrefix}:${taste}`
}
