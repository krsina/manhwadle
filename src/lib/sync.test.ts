import { describe, expect, it } from 'vitest'
import type { DayState } from './anilist-types'
import type { ModeStats } from './stats'
import { mergeDayProgress, mergeModeStats } from './sync'

function emptyStats(overrides: Partial<ModeStats> = {}): ModeStats {
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
    ...overrides,
  }
}

function day(
  overrides: Partial<DayState> & Pick<DayState, 'status' | 'guessIds'>,
): DayState {
  return {
    dateKey: '2026-07-15',
    answerId: 42,
    ...overrides,
  }
}

describe('mergeModeStats', () => {
  it('takes max of played/wins/maxStreak always', () => {
    const local = emptyStats({
      played: 5,
      wins: 3,
      maxStreak: 2,
      lastPlayedDateKey: '2026-07-10',
      currentStreak: 1,
    })
    const remote = emptyStats({
      played: 8,
      wins: 2,
      maxStreak: 4,
      lastPlayedDateKey: '2026-07-14',
      currentStreak: 3,
    })
    const merged = mergeModeStats(local, remote)
    expect(merged.played).toBe(8)
    expect(merged.wins).toBe(3)
    expect(merged.maxStreak).toBe(4)
  })

  it('prefers newer lastPlayedDateKey for currentStreak and distribution', () => {
    const local = emptyStats({
      lastPlayedDateKey: '2026-07-10',
      currentStreak: 1,
      guessDistribution: [1, 0, 0, 0, 0, 0],
      bonusAttempts: 1,
      lastBonusDateKey: '2026-07-10',
    })
    const remote = emptyStats({
      lastPlayedDateKey: '2026-07-14',
      currentStreak: 5,
      guessDistribution: [0, 0, 2, 0, 0, 0],
      bonusAttempts: 3,
      lastBonusDateKey: '2026-07-14',
    })
    const merged = mergeModeStats(local, remote)
    expect(merged.lastPlayedDateKey).toBe('2026-07-14')
    expect(merged.currentStreak).toBe(5)
    expect(merged.guessDistribution).toEqual([0, 0, 2, 0, 0, 0])
    expect(merged.bonusAttempts).toBe(3)
    expect(merged.lastBonusDateKey).toBe('2026-07-14')
  })

  it('keeps max double solves even when the other side has a newer play day', () => {
    const local = emptyStats({
      lastPlayedDateKey: '2026-07-10',
      lastBonusDateKey: '2026-07-10',
      bonusAttempts: 2,
      bonusCorrect: 2,
      doubleSolves: 2,
    })
    const remote = emptyStats({
      lastPlayedDateKey: '2026-07-16',
      lastBonusDateKey: null,
      bonusAttempts: 0,
      bonusCorrect: 0,
      doubleSolves: 0,
      currentStreak: 1,
      guessDistribution: [0, 1, 0, 0, 0, 0],
    })
    const merged = mergeModeStats(local, remote)
    expect(merged.doubleSolves).toBe(2)
    expect(merged.bonusAttempts).toBe(2)
    expect(merged.bonusCorrect).toBe(2)
    expect(merged.lastBonusDateKey).toBe('2026-07-10')
    expect(merged.currentStreak).toBe(1)
  })

  it('when dates tie, takes max of streak-like counters and distribution buckets', () => {
    const local = emptyStats({
      lastPlayedDateKey: '2026-07-15',
      currentStreak: 2,
      guessDistribution: [3, 0, 1, 0, 0, 0],
      bonusAttempts: 2,
      doubleSolves: 1,
      lastBonusDateKey: '2026-07-15',
    })
    const remote = emptyStats({
      lastPlayedDateKey: '2026-07-15',
      currentStreak: 4,
      guessDistribution: [1, 2, 0, 0, 0, 0],
      bonusAttempts: 1,
      doubleSolves: 0,
      lastBonusDateKey: '2026-07-14',
    })
    const merged = mergeModeStats(local, remote)
    expect(merged.currentStreak).toBe(4)
    expect(merged.guessDistribution).toEqual([3, 2, 1, 0, 0, 0])
    expect(merged.bonusAttempts).toBe(2)
    expect(merged.doubleSolves).toBe(1)
    expect(merged.lastBonusDateKey).toBe('2026-07-15')
  })

  it('prefers local when local lastPlayedDateKey is newer', () => {
    const local = emptyStats({
      lastPlayedDateKey: '2026-07-15',
      currentStreak: 7,
      guessDistribution: [0, 1, 0, 0, 0, 0],
    })
    const remote = emptyStats({
      lastPlayedDateKey: '2026-07-01',
      currentStreak: 99,
      guessDistribution: [9, 9, 9, 9, 9, 9],
    })
    const merged = mergeModeStats(local, remote)
    expect(merged.currentStreak).toBe(7)
    expect(merged.guessDistribution).toEqual([0, 1, 0, 0, 0, 0])
  })
})

describe('mergeDayProgress', () => {
  it('returns the non-null side when one is missing', () => {
    const local = day({ status: 'playing', guessIds: [1] })
    expect(mergeDayProgress(local, null)).toBe(local)
    expect(mergeDayProgress(null, local)).toBe(local)
    expect(mergeDayProgress(null, null)).toBeNull()
  })

  it('prefers a finished round over an in-progress one', () => {
    const playing = day({ status: 'playing', guessIds: [1, 2, 3] })
    const won = day({ status: 'won', guessIds: [1] })
    expect(mergeDayProgress(playing, won)).toBe(won)
    expect(mergeDayProgress(won, playing)).toBe(won)
  })

  it('when both unfinished, prefers the side with more guesses', () => {
    const few = day({ status: 'playing', guessIds: [1] })
    const many = day({ status: 'playing', guessIds: [1, 2, 3] })
    expect(mergeDayProgress(few, many)).toBe(many)
    expect(mergeDayProgress(many, few)).toBe(many)
  })

  it('when both finished with same guess count, keeps local', () => {
    const local = day({ status: 'won', guessIds: [1, 2] })
    const remote = day({ status: 'lost', guessIds: [3, 4] })
    expect(mergeDayProgress(local, remote)).toBe(local)
  })
})
