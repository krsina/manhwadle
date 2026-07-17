import { describe, expect, it } from 'vitest'
import {
  annotateWeekStreakStyles,
  computePlayStreak,
  dayPlayLevelFromStatuses,
  shiftUtcDateKey,
} from './streak'

describe('shiftUtcDateKey', () => {
  it('moves across month boundaries in UTC', () => {
    expect(shiftUtcDateKey('2026-07-01', -1)).toBe('2026-06-30')
    expect(shiftUtcDateKey('2026-06-30', 1)).toBe('2026-07-01')
  })
})

describe('dayPlayLevelFromStatuses', () => {
  it('classifies none / any / all from finished modes', () => {
    expect(
      dayPlayLevelFromStatuses(['available', 'available', 'available']),
    ).toBe('none')
    expect(dayPlayLevelFromStatuses(['won', 'available', 'playing'])).toBe('any')
    expect(dayPlayLevelFromStatuses(['first-try', 'lost', 'double-solve'])).toBe('all')
    expect(dayPlayLevelFromStatuses(['lost', 'lost', 'lost'])).toBe('all')
  })
})

describe('computePlayStreak', () => {
  it('counts consecutive any-mode days with today grace', () => {
    const played = ['2026-07-14', '2026-07-15', '2026-07-16']
    expect(computePlayStreak(played, '2026-07-17')).toEqual({
      currentStreak: 3,
      maxStreak: 3,
      lastPlayedDateKey: '2026-07-16',
    })
    expect(computePlayStreak(played, '2026-07-16')).toEqual({
      currentStreak: 3,
      maxStreak: 3,
      lastPlayedDateKey: '2026-07-16',
    })
  })

  it('breaks current streak on a missed day but keeps max', () => {
    const played = ['2026-07-10', '2026-07-11', '2026-07-14', '2026-07-15']
    expect(computePlayStreak(played, '2026-07-17')).toEqual({
      currentStreak: 0,
      maxStreak: 2,
      lastPlayedDateKey: '2026-07-15',
    })
    expect(computePlayStreak(played, '2026-07-15')).toEqual({
      currentStreak: 2,
      maxStreak: 2,
      lastPlayedDateKey: '2026-07-15',
    })
  })

  it('finds longer historical max runs', () => {
    const played = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-10',
      '2026-07-11',
    ]
    expect(computePlayStreak(played, '2026-07-11').maxStreak).toBe(4)
    expect(computePlayStreak(played, '2026-07-11').currentStreak).toBe(2)
  })
})

describe('annotateWeekStreakStyles', () => {
  it('marks start/middle/end edges for connected runs', () => {
    const levels = [
      null,
      'any',
      'any',
      'all',
      'none',
      'all',
      'all',
    ] as const
    expect(annotateWeekStreakStyles(levels)).toEqual([
      null,
      { level: 'any', edge: 'start' },
      { level: 'any', edge: 'middle' },
      { level: 'any', edge: 'end' },
      null,
      { level: 'any', edge: 'start' },
      { level: 'any', edge: 'end' },
    ])
  })
})
