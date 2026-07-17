import { describe, expect, it } from 'vitest'
import { combineModeStats, type ModeStats } from './stats'

function makeStats(partial: Partial<ModeStats>): ModeStats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDateKey: null,
    guessDistribution: [0, 0, 0, 0, 0, 0],
    bonusAttempts: 0,
    bonusCorrect: 0,
    doubleSolves: 0,
    lastBonusDateKey: null,
    ...partial,
  }
}

describe('combineModeStats', () => {
  it('sums plays, wins, and distribution across modes', () => {
    const combined = combineModeStats([
      makeStats({
        played: 4,
        wins: 3,
        currentStreak: 2,
        maxStreak: 3,
        guessDistribution: [1, 0, 2, 0, 0, 0],
      }),
      makeStats({
        played: 2,
        wins: 1,
        currentStreak: 1,
        maxStreak: 5,
        guessDistribution: [0, 1, 0, 0, 0, 0],
        bonusAttempts: 2,
        bonusCorrect: 1,
        doubleSolves: 1,
      }),
      makeStats({
        played: 1,
        wins: 0,
        currentStreak: 0,
        maxStreak: 1,
        guessDistribution: [0, 0, 0, 0, 0, 0],
      }),
    ])

    expect(combined.played).toBe(7)
    expect(combined.wins).toBe(4)
    expect(combined.currentStreak).toBe(2)
    expect(combined.maxStreak).toBe(5)
    expect(combined.guessDistribution).toEqual([1, 1, 2, 0, 0, 0])
    expect(combined.bonusAttempts).toBe(2)
    expect(combined.bonusCorrect).toBe(1)
    expect(combined.doubleSolves).toBe(1)
  })
})
