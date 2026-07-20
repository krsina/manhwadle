import { describe, expect, it } from 'vitest'
import {
  computeStreakFromDates,
  isAllModeDayComplete,
  isNeutralAllModeDay,
  isStreakCurrentlyActive,
  liveCurrentStreak,
  onlyNeutralBetween,
  shiftUtcDateKey,
} from './community-streak-sql.mjs'

describe('liveCurrentStreak decay', () => {
  it('preserves yesterday grace and zeros older last dates', () => {
    expect(liveCurrentStreak(5, '2026-07-17', '2026-07-17')).toBe(5)
    expect(liveCurrentStreak(5, '2026-07-16', '2026-07-17')).toBe(5)
    expect(liveCurrentStreak(5, '2026-07-15', '2026-07-17')).toBe(0)
    expect(liveCurrentStreak(5, null, '2026-07-17')).toBe(0)
  })

  it('extends activity through fully exempt neutral dates', () => {
    expect(
      isStreakCurrentlyActive('2026-07-14', '2026-07-17', [
        '2026-07-15',
        '2026-07-16',
      ]),
    ).toBe(true)
    expect(
      liveCurrentStreak(3, '2026-07-14', '2026-07-17', [
        '2026-07-15',
        '2026-07-16',
      ]),
    ).toBe(3)
    expect(
      liveCurrentStreak(3, '2026-07-14', '2026-07-17', ['2026-07-16']),
    ).toBe(0)
  })
})

describe('neutral all-mode days', () => {
  it('treats empty effective required set as neutral, not complete', () => {
    expect(isNeutralAllModeDay([])).toBe(true)
    expect(isAllModeDayComplete([], ['summary'])).toBe(false)
    expect(
      isAllModeDayComplete(['summary', 'cover'], ['summary', 'cover']),
    ).toBe(true)
  })

  it('skips neutral dates for streak adjacency', () => {
    const stats = computeStreakFromDates(
      ['2026-07-14', '2026-07-16'],
      '2026-07-16',
      ['2026-07-15'],
    )
    expect(stats.currentStreak).toBe(2)
    expect(stats.maxStreak).toBe(2)
    expect(onlyNeutralBetween('2026-07-14', '2026-07-16', ['2026-07-15'])).toBe(
      true,
    )
    expect(onlyNeutralBetween('2026-07-14', '2026-07-16', [])).toBe(false)
  })

  it('does not bridge a missed playable day', () => {
    const stats = computeStreakFromDates(
      ['2026-07-14', '2026-07-16'],
      '2026-07-16',
      [],
    )
    expect(stats.currentStreak).toBe(1)
    expect(stats.maxStreak).toBe(1)
  })

  it('uses yesterday grace when today is playable but unfinished', () => {
    const stats = computeStreakFromDates(
      ['2026-07-15', '2026-07-16'],
      '2026-07-17',
      [],
    )
    expect(stats.currentStreak).toBe(2)
    expect(shiftUtcDateKey('2026-07-17', -1)).toBe('2026-07-16')
  })
})
