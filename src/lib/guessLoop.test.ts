import { describe, expect, it } from 'vitest'
import { applyGuess } from './guessLoop'

describe('applyGuess', () => {
  it('ignores guesses when not playing or duplicate', () => {
    expect(
      applyGuess({ status: 'won', guessIds: [1] }, 2, 9, 6),
    ).toBeNull()
    expect(
      applyGuess({ status: 'playing', guessIds: [1] }, 1, 9, 6),
    ).toBeNull()
  })

  it('marks won on correct id', () => {
    expect(applyGuess({ status: 'playing', guessIds: [] }, 9, 9, 6)).toEqual({
      guessIds: [9],
      status: 'won',
    })
  })

  it('keeps playing until maxGuesses then marks lost', () => {
    const mid = applyGuess({ status: 'playing', guessIds: [1, 2] }, 3, 9, 6)
    expect(mid).toEqual({ guessIds: [1, 2, 3], status: 'playing' })

    const lost = applyGuess(
      { status: 'playing', guessIds: [1, 2, 3, 4, 5] },
      6,
      9,
      6,
    )
    expect(lost).toEqual({ guessIds: [1, 2, 3, 4, 5, 6], status: 'lost' })
  })
})
