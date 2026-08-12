import { describe, expect, it } from 'vitest'
import {
  getArchiveCellStatus,
  hasTripleSolveStatuses,
  isArchiveDate,
  isValidDateKey,
  parseDateKey,
  toDateKey,
} from './archive'
import type { DayState } from './anilist-types'

describe('archive helpers', () => {
  it('validates real YYYY-MM-DD UTC dates', () => {
    expect(isValidDateKey('2026-07-15')).toBe(true)
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2024-02-29')).toBe(true)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('not-a-date')).toBe(false)
    expect(parseDateKey(' 2026-07-15 ')).toBe('2026-07-15')
    expect(parseDateKey('nope')).toBeNull()
  })

  it('treats only past days as archive relative to today', () => {
    expect(isArchiveDate('2026-07-15', '2026-07-17')).toBe(true)
    expect(isArchiveDate('2026-07-17', '2026-07-17')).toBe(false)
    expect(isArchiveDate('2026-07-18', '2026-07-17')).toBe(false)
  })

  it('builds date keys from UTC parts', () => {
    expect(toDateKey(2026, 6, 5)).toBe('2026-07-05')
  })

  it('derives calendar cell status from availability and local DayState', () => {
    expect(getArchiveCellStatus(false, null)).toBe('unavailable')
    expect(getArchiveCellStatus(true, null)).toBe('available')

    const playing: DayState = {
      dateKey: '2026-07-15',
      answerId: 1,
      guessIds: [2],
      status: 'playing',
    }
    expect(getArchiveCellStatus(true, playing)).toBe('playing')

    const emptyPlaying: DayState = {
      dateKey: '2026-07-15',
      answerId: 1,
      guessIds: [],
      status: 'playing',
    }
    expect(getArchiveCellStatus(true, emptyPlaying)).toBe('available')

    expect(
      getArchiveCellStatus(true, {
        ...playing,
        guessIds: [2, 1],
        status: 'won',
      }),
    ).toBe('won')
    expect(
      getArchiveCellStatus(true, {
        dateKey: '2026-07-15',
        answerId: 1,
        guessIds: [1],
        status: 'won',
      }),
    ).toBe('first-try')
    expect(
      getArchiveCellStatus(true, {
        dateKey: '2026-07-15',
        answerId: 1,
        guessIds: [1],
        status: 'won',
        hintsUsed: 1,
      }),
    ).toBe('won')
    expect(
      getArchiveCellStatus(true, {
        dateKey: '2026-07-15',
        answerId: 1,
        guessIds: [1],
        status: 'won',
        bonusNameCorrect: true,
      }),
    ).toBe('double-solve')
    expect(
      getArchiveCellStatus(true, {
        dateKey: '2026-07-15',
        answerId: 1,
        guessIds: [1],
        status: 'won',
        hintsUsed: 2,
        bonusNameCorrect: true,
      }),
    ).toBe('won')
    expect(
      getArchiveCellStatus(true, {
        dateKey: '2026-07-15',
        answerId: 1,
        guessIds: [2, 1],
        status: 'won',
        bonusNameCorrect: true,
      }),
    ).toBe('won')
    expect(
      getArchiveCellStatus(true, {
        ...playing,
        status: 'lost',
      }),
    ).toBe('lost')
  })

  it('detects a full day of solves across modes', () => {
    expect(hasTripleSolveStatuses(['won', 'first-try', 'won'])).toBe(true)
    expect(hasTripleSolveStatuses(['won', 'lost', 'won'])).toBe(false)
    expect(hasTripleSolveStatuses(['double-solve', 'won', 'first-try'])).toBe(true)
  })
})
