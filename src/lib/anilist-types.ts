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

export interface Manhwa {
  id: number
  title: ManhwaTitle
  synonyms: string[]
  description: string
  genres: string[]
  tags: string[]
  status: ManhwaStatus
  startDate: StartDate
  coverImage: string | null
  siteUrl: string
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

export interface TagFeedback {
  tone: FeedbackTone
  guessed: string[]
  shared: string[]
  sharedCount: number
}

export interface GuessFeedback {
  manhwa: Manhwa
  isCorrect: boolean
  genres: GenreFeedback
  year: YearFeedback
  status: StatusFeedback
  tags: TagFeedback
}

export interface DayState {
  dateKey: string
  answerId: number
  guessIds: number[]
  status: 'playing' | 'won' | 'lost'
}
