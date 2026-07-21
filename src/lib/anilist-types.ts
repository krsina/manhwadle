export type ManhwaStatus =
  | 'Ongoing'
  | 'Completed'
  | 'Hiatus'
  | 'Cancelled'
  | 'Not yet released'
  | 'Unknown'
  | string

/** All release statuses used in the game (from AniList MediaStatus v2) */
export const MANHWA_STATUSES = [
  'Ongoing',
  'Completed',
  'Hiatus',
  'Cancelled',
  'Not yet released',
] as const satisfies readonly ManhwaStatus[]

export interface ManhwaTitle {
  english: string | null
  romaji: string | null
  native: string | null
}

export interface StartDate {
  year: number | null
  month: number | null
  day: number | null
}

export interface ManhwaCharacter {
  id: number
  /** AniList role on this title */
  role: 'MAIN' | 'SUPPORTING' | 'BACKGROUND' | string
  name: {
    full: string | null
    native: string | null
    alternative: string[]
  }
  description: string | null
  image: {
    large: string | null
    medium: string | null
  }
  siteUrl: string | null
  favourites: number | null
  /**
   * When true (default), this character may be used as a Character-mode guess image.
   * Omitted / undefined is treated as true.
   */
  useForGuess?: boolean
}

/** Eligible for Character mode unless explicitly opted out. */
export function isCharacterEnabledForGuess(character: ManhwaCharacter): boolean {
  return character.useForGuess !== false
}

export function characterImageUrl(character: ManhwaCharacter): string | null {
  return character.image.large || character.image.medium || null
}

export interface Manhwa {
  id: number
  /** MyAnimeList manga id when known (from ETL; optional on older syncs) */
  idMal?: number | null
  title: ManhwaTitle
  synonyms: string[]
  description: string
  genres: string[]
  tags: string[]
  status: ManhwaStatus
  /** English platform / publisher from AniList Source tag (e.g. WEBTOON, Tapas) */
  publisher: string
  startDate: StartDate
  coverImage: string | null
  siteUrl: string
  /** Characters attached from catalog ETL (MAIN first) */
  characters: ManhwaCharacter[]
  /**
   * AniList popularity ordinal in the catalog band (1 = most popular).
   * Present on the player client catalog; optional on older fixtures.
   */
  rank?: number | null
}

/** Cast members AniList marks as MAIN (often more than one co-lead). */
export function mainCharacters(manhwa: Manhwa): ManhwaCharacter[] {
  return (manhwa.characters || []).filter((character) => character.role === 'MAIN')
}

export type FeedbackTone = 'correct' | 'close' | 'incorrect'

export interface GenreFeedback {
  tone: FeedbackTone
  shared: string[]
  guessed: string[]
}

export interface YearFeedback {
  tone: FeedbackTone
  year: number | null
  direction: 'up' | 'down' | 'exact' | 'unknown'
}

export interface StatusFeedback {
  tone: FeedbackTone
  status: ManhwaStatus
}

export interface PublisherFeedback {
  tone: FeedbackTone
  publisher: string
}

export interface TagFeedback {
  tone: FeedbackTone
  guessed: string[]
  shared: string[]
  sharedCount: number
}

export interface GuessFeedback {
  manhwa: Manhwa
  isCorrect: boolean
  /** Title form the player selected (alias or primary); falls back to displayTitle in UI */
  displayLabel?: string
  genres: GenreFeedback
  year: YearFeedback
  status: StatusFeedback
  publisher: PublisherFeedback
  tags: TagFeedback
}

export interface DayState {
  dateKey: string
  answerId: number
  guessIds: number[]
  /** Parallel to guessIds — form the player selected (title or alias) */
  guessLabels?: string[]
  status: 'playing' | 'won' | 'lost'
  /**
   * Absolute clue ladder index (0 = opening hint).
   * Effective progress is max(wrong guesses, clueStep) so players can
   * extend hints without spending a guess.
   */
  clueStep?: number
  /** Free “reveal more” taps this round (does not include wrong-guess unlocks). */
  hintsUsed?: number
  /** Summary hard mode: t0 only (locked once guesses start) */
  hardMode?: boolean
  /** Character-mode bonus: one-shot name guess after a win */
  bonusNameGuess?: string
  bonusNameCorrect?: boolean
}
