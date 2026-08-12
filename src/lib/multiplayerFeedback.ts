import type {
  FeedbackTone,
  GuessFeedback,
  Manhwa,
} from './anilist-types'
import { findById } from './search'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tone(value: unknown): FeedbackTone {
  return value === 'correct' || value === 'close' || value === 'incorrect'
    ? value
    : 'incorrect'
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function nested(
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return isRecord(row[key]) ? row[key] : {}
}

/**
 * Pool meta historically omitted answer_label, so the server fell back to
 * `#<guess_id>`. Prefer the public catalog title in that case.
 */
export function resolveMultiplayerDisplayLabel(
  rawLabel: unknown,
  guessId: number,
): string | undefined {
  if (typeof rawLabel !== 'string') return undefined
  const label = rawLabel.trim()
  if (!label) return undefined
  if (label === `#${guessId}` || label === `Title ${guessId}`) return undefined
  return label
}

export function buildMultiplayerFeedbackRows(
  rawRows: Record<string, unknown>[] | null,
  guessIds: number[] | null,
  pool: Manhwa[],
): GuessFeedback[] {
  if (!rawRows || !guessIds) return []

  return rawRows.flatMap((row, index) => {
    const rawGuessId =
      typeof row.guess_id === 'number' ? Math.floor(row.guess_id) : guessIds[index]
    if (!rawGuessId) return []
    const guess = findById(pool, rawGuessId)
    if (!guess) return []

    const genres = nested(row, 'genres')
    const year = nested(row, 'year')
    const status = nested(row, 'status')
    const publisher = nested(row, 'publisher')
    const tags = nested(row, 'tags')
    const direction =
      year.direction === 'up' ||
      year.direction === 'down' ||
      year.direction === 'exact' ||
      year.direction === 'unknown'
        ? year.direction
        : 'unknown'
    const sharedTags = strings(tags.shared)

    return [{
      manhwa: guess,
      isCorrect: row.is_correct === true,
      displayLabel: resolveMultiplayerDisplayLabel(row.display_label, rawGuessId),
      genres: {
        tone: tone(genres.tone),
        shared: strings(genres.shared),
        guessed: guess.genres,
      },
      year: {
        tone: tone(year.tone),
        year: guess.startDate?.year ?? null,
        direction,
      },
      status: {
        tone: tone(status.tone),
        status: guess.status,
      },
      publisher: {
        tone: tone(publisher.tone),
        publisher: guess.publisher ?? '',
      },
      tags: {
        tone: tone(tags.tone),
        guessed: guess.tags,
        shared: sharedTags,
        sharedCount: sharedTags.length,
      },
    }]
  })
}
