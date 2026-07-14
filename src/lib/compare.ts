import type {
  FeedbackTone,
  GenreFeedback,
  GuessFeedback,
  Manhwa,
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
    TONE_EMOJI[feedback.tags.tone],
  ].join('')
}

export function buildShareText(
  appName: string,
  dateKey: string,
  guessCount: number,
  maxGuesses: number,
  won: boolean,
  lines: string[],
): string {
  const score = won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`
  return [`${appName} ${dateKey} ${score}`, '', ...lines].join('\n')
}
