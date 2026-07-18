import { describe, expect, it } from 'vitest'
import type { DayState } from './anilist-types'
import {
  advanceClue,
  canAdvanceClue,
  clueProgress,
  wrongGuessCount,
} from './clueProgress'

function day(
  overrides: Partial<DayState> & Pick<DayState, 'status' | 'guessIds'>,
): DayState {
  return {
    dateKey: '2026-07-17',
    answerId: 1,
    ...overrides,
  }
}

describe('clueProgress', () => {
  it('wrongGuessCount excludes the winning guess', () => {
    expect(wrongGuessCount(day({ status: 'playing', guessIds: [2, 3] }))).toBe(2)
    expect(wrongGuessCount(day({ status: 'won', guessIds: [2, 1] }))).toBe(1)
    expect(wrongGuessCount(day({ status: 'won', guessIds: [1] }))).toBe(0)
  })

  it('uses the higher of wrong guesses and clueStep', () => {
    expect(clueProgress(day({ status: 'playing', guessIds: [] }))).toBe(0)
    expect(
      clueProgress(day({ status: 'playing', guessIds: [], clueStep: 2 })),
    ).toBe(2)
    expect(
      clueProgress(day({ status: 'playing', guessIds: [2, 3], clueStep: 1 })),
    ).toBe(2)
  })

  it('advanceClue bumps clueStep without adding guesses', () => {
    const start = day({ status: 'playing', guessIds: [] })
    const next = advanceClue(start, 5)
    expect(next).toEqual({ ...start, clueStep: 1, hintsUsed: 1 })
    expect(next?.guessIds).toEqual([])

    const again = advanceClue(next!, 5)
    expect(again?.clueStep).toBe(2)
    expect(again?.hintsUsed).toBe(2)
  })

  it('advanceClue is a no-op at the cap or when finished', () => {
    expect(
      advanceClue(day({ status: 'playing', guessIds: [], clueStep: 5 }), 5),
    ).toBeNull()
    expect(
      canAdvanceClue(day({ status: 'playing', guessIds: [1, 2, 3, 4, 5] }), 5),
    ).toBe(false)
    expect(
      advanceClue(day({ status: 'won', guessIds: [1], clueStep: 0 }), 5),
    ).toBeNull()
  })
})
