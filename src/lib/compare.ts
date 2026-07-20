import type {
  FeedbackTone,
  GenreFeedback,
  GuessFeedback,
  Manhwa,
  PublisherFeedback,
  StatusFeedback,
  TagFeedback,
  YearFeedback,
} from './anilist-types'

function normalizeSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

function sharedLabels(guessed: string[], answer: string[]): string[] {
  const answerSet = normalizeSet(answer)
  const seen = new Set<string>()
  const shared: string[] = []
  for (const label of guessed) {
    const key = label.trim().toLowerCase()
    if (!key || seen.has(key) || !answerSet.has(key)) continue
    seen.add(key)
    shared.push(label)
  }
  return shared
}

export function compareGenres(guess: Manhwa, answer: Manhwa): GenreFeedback {
  const guessSet = normalizeSet(guess.genres)
  const answerSet = normalizeSet(answer.genres)
  const shared = sharedLabels(guess.genres, answer.genres)

  let tone: FeedbackTone = 'incorrect'
  if (setsEqual(guessSet, answerSet) && guessSet.size > 0) {
    tone = 'correct'
  } else if (shared.length > 0) {
    tone = 'close'
  }

  return {
    tone,
    shared,
    guessed: [...guess.genres],
  }
}

export function compareYear(guess: Manhwa, answer: Manhwa): YearFeedback {
  const guessYear = guess.startDate.year
  const answerYear = answer.startDate.year

  if (guessYear == null || answerYear == null) {
    return {
      tone: 'incorrect',
      year: guessYear,
      direction: 'unknown',
    }
  }

  if (guessYear === answerYear) {
    return { tone: 'correct', year: guessYear, direction: 'exact' }
  }

  const diff = Math.abs(guessYear - answerYear)
  return {
    tone: diff <= 2 ? 'close' : 'incorrect',
    year: guessYear,
    direction: guessYear < answerYear ? 'up' : 'down',
  }
}

export function compareStatus(guess: Manhwa, answer: Manhwa): StatusFeedback {
  const tone: FeedbackTone =
    guess.status.trim().toLowerCase() === answer.status.trim().toLowerCase()
      ? 'correct'
      : 'incorrect'

  return { tone, status: guess.status }
}

export function comparePublisher(guess: Manhwa, answer: Manhwa): PublisherFeedback {
  const tone: FeedbackTone =
    guess.publisher.trim().toLowerCase() === answer.publisher.trim().toLowerCase()
      ? 'correct'
      : 'incorrect'

  return { tone, publisher: guess.publisher }
}

export function compareTags(guess: Manhwa, answer: Manhwa): TagFeedback {
  const shared = sharedLabels(guess.tags, answer.tags)
  return {
    tone: shared.length > 0 ? 'close' : 'incorrect',
    guessed: [...guess.tags],
    shared,
    sharedCount: shared.length,
  }
}

export function compareGuess(guess: Manhwa, answer: Manhwa): GuessFeedback {
  const isCorrect = guess.id === answer.id
  return {
    manhwa: guess,
    isCorrect,
    genres: isCorrect
      ? { tone: 'correct', shared: [...answer.genres], guessed: [...guess.genres] }
      : compareGenres(guess, answer),
    year: isCorrect
      ? { tone: 'correct', year: guess.startDate.year, direction: 'exact' }
      : compareYear(guess, answer),
    status: isCorrect
      ? { tone: 'correct', status: guess.status }
      : compareStatus(guess, answer),
    publisher: isCorrect
      ? { tone: 'correct', publisher: guess.publisher }
      : comparePublisher(guess, answer),
    tags: isCorrect
      ? {
          tone: 'correct',
          guessed: [...guess.tags],
          shared: [...guess.tags],
          sharedCount: guess.tags.length,
        }
      : compareTags(guess, answer),
  }
}

/** True when every feedback tile is incorrect (all-white share line). */
export function isCompleteMiss(feedback: GuessFeedback): boolean {
  if (feedback.isCorrect) return false
  return (
    feedback.genres.tone === 'incorrect' &&
    feedback.year.tone === 'incorrect' &&
    feedback.status.tone === 'incorrect' &&
    feedback.publisher.tone === 'incorrect' &&
    feedback.tags.tone === 'incorrect'
  )
}

const TONE_EMOJI: Record<FeedbackTone, string> = {
  correct: '🟩',
  close: '🟨',
  incorrect: '⬜',
}

export function feedbackToShareLine(feedback: GuessFeedback): string {
  return [
    TONE_EMOJI[feedback.genres.tone],
    TONE_EMOJI[feedback.year.tone],
    TONE_EMOJI[feedback.status.tone],
    TONE_EMOJI[feedback.publisher.tone],
    TONE_EMOJI[feedback.tags.tone],
  ].join('')
}

export interface ShareTextOptions {
  appName: string
  modeLabel: string
  tasteLabel: string
  dateKey: string
  guessCount: number
  maxGuesses: number
  won: boolean
  lines: string[]
  /** When bonus was answered: true/false; omit if unanswered */
  bonusCorrect?: boolean | null
  doubleSolve?: boolean
  /** Prefix header with Archive when sharing a historical puzzle */
  archive?: boolean
  /** Append * to the score (Wordle-style hard mode) */
  hardMode?: boolean
  /** Free hint reveals used this round */
  hintsUsed?: number
  siteUrl?: string
}

/** Guess score line, optionally with free-hint count. */
export function formatGuessScore(options: {
  won: boolean
  guessCount: number
  maxGuesses: number
  hardMode?: boolean
  hintsUsed?: number
}): string {
  const {
    won,
    guessCount,
    maxGuesses,
    hardMode = false,
    hintsUsed = 0,
  } = options
  const scoreBase = won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`
  const score = hardMode ? `${scoreBase}*` : scoreBase
  if (hintsUsed <= 0) return score
  return `${score} · ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}`
}

export function buildShareText(options: ShareTextOptions): string {
  const {
    appName,
    modeLabel,
    tasteLabel,
    dateKey,
    guessCount,
    maxGuesses,
    won,
    lines,
    bonusCorrect = null,
    doubleSolve = false,
    archive = false,
    hardMode = false,
    hintsUsed = 0,
    siteUrl,
  } = options

  const score = formatGuessScore({
    won,
    guessCount,
    maxGuesses,
    hardMode,
    hintsUsed,
  })
  const archivePrefix = archive ? 'Archive · ' : ''
  const header = `${archivePrefix}${appName} ${modeLabel} · ${tasteLabel}  ${dateKey}  ${score}`
  const parts = [header, '', ...lines]

  if (bonusCorrect === true) parts.push('', 'Bonus ✓')
  else if (bonusCorrect === false) parts.push('', 'Bonus ✗')

  if (doubleSolve) parts.push('✦ Double solve')

  const url = siteUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '')
  if (url) parts.push('', url)

  return parts.join('\n')
}
