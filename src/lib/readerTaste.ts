import type { Manhwa } from './anilist-types'
import tasteLaneOverrides from '../data/tasteLaneOverrides.json'

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
    description: 'Draw today’s puzzle from the full catalog.',
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

/** Feminine / otome signals used to break score ties and gate Romance titles. */
const FEMININE_TAGS = new Set([
  'Villainess',
  'Otome Game',
  'Female Protagonist',
  'Ojou-sama',
  'Love Triangle',
  'Royal Affairs',
  'Male Harem',
])

/** Strong otome / feminine tags — enough alone with Romance to force romance lane. */
const OTOME_TAGS = new Set([
  'Villainess',
  'Otome Game',
  'Ojou-sama',
  'Male Harem',
  'Royal Affairs',
])

const LANE_OVERRIDES: ReadonlyMap<number, ManhwaTasteLane> = new Map(
  Object.entries(tasteLaneOverrides.lanes || {}).map(([id, lane]) => [
    Number(id),
    lane as ManhwaTasteLane,
  ]),
)

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

function hasGenre(manhwa: Manhwa, genre: string): boolean {
  return (manhwa.genres || []).some((g) => g === genre)
}

function hasAnyTag(manhwa: Manhwa, tags: Set<string>): boolean {
  return (manhwa.tags || []).some((t) => tags.has(t))
}

/**
 * Otome / princess-romance titles often score as "action" because Fantasy +
 * Isekai outweigh Romance. Detect feminine Romance before numeric scoring.
 */
function isFeminineRomanceTitle(manhwa: Manhwa): boolean {
  if (!hasGenre(manhwa, 'Romance')) return false
  if (hasAnyTag(manhwa, OTOME_TAGS)) return true
  const femaleLead = hasAnyTag(manhwa, new Set(['Female Protagonist']))
  const maleLead = hasAnyTag(manhwa, new Set(['Male Protagonist']))
  if (femaleLead && !maleLead) return true
  // Classic fantasy romance / isekai otome without an Action genre tag
  if (hasGenre(manhwa, 'Fantasy') && !hasGenre(manhwa, 'Action')) return true
  return false
}

/**
 * Break equal action/romance scores toward masculine (action) or feminine (romance).
 * Fantasy+Romance otome leans romance; Action without Romance leans action.
 */
function breakTasteTie(manhwa: Manhwa): ManhwaTasteLane {
  if (isFeminineRomanceTitle(manhwa)) return 'romance'
  const hasRomance = hasGenre(manhwa, 'Romance')
  const hasAction = hasGenre(manhwa, 'Action')
  const hasFantasy = hasGenre(manhwa, 'Fantasy')
  const feminine = hasAnyTag(manhwa, FEMININE_TAGS)
  const maleLead = hasAnyTag(manhwa, new Set(['Male Protagonist']))
  const femaleLead = hasAnyTag(manhwa, new Set(['Female Protagonist']))

  if (hasRomance && (feminine || (hasFantasy && !hasAction))) return 'romance'
  if (hasAction && !hasRomance) return 'action'
  if (hasAction && maleLead && !femaleLead) return 'action'
  if (hasFantasy && hasRomance) return 'romance'
  if (hasAction || maleLead) return 'action'
  if (hasRomance || feminine) return 'romance'
  return 'both'
}

/** Which focused lane a title belongs to. Manual overrides win; else score + tie-break. */
export function classifyManhwaTaste(manhwa: Manhwa): ManhwaTasteLane {
  const override = LANE_OVERRIDES.get(manhwa.id)
  if (override === 'action' || override === 'romance' || override === 'both') {
    return override
  }

  // Prefer feminine/otome Romance over Fantasy/Isekai action inflation.
  if (isFeminineRomanceTitle(manhwa)) return 'romance'

  const action = scoreSide(manhwa, ACTION_GENRES, ACTION_TAGS)
  const romance = scoreSide(manhwa, ROMANCE_GENRES, ROMANCE_TAGS)

  if (action === 0 && romance === 0) return breakTasteTie(manhwa)
  if (action === romance) return breakTasteTie(manhwa)
  return action > romance ? 'action' : 'romance'
}

export function manhwaMatchesTaste(manhwa: Manhwa, taste: ReaderTaste): boolean {
  if (taste === 'both') return true
  const lane = classifyManhwaTaste(manhwa)
  // "both" lane titles still appear in either focused preference.
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
