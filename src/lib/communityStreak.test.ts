import { describe, expect, it } from 'vitest'
import {
  filterFromEpoch,
  hasUtcGap,
  isAllModeDayComplete,
  isAnyModeDayComplete,
  summarizeCommunityStreaks,
} from './communityStreak'
import { shiftUtcDateKey } from './streak'

describe('isAllModeDayComplete', () => {
  it('requires every non-exempt mode', () => {
    expect(
      isAllModeDayComplete({
        requiredModes: ['summary', 'character', 'cover', 'heardle'],
        completedModes: ['summary', 'character', 'cover'],
      }),
    ).toBe(false)

    expect(
      isAllModeDayComplete({
        requiredModes: ['summary', 'character', 'cover', 'heardle'],
        completedModes: ['summary', 'character', 'cover'],
        exemptModes: ['heardle'],
      }),
    ).toBe(true)
  })

  it('does not treat empty required set as complete', () => {
    expect(
      isAllModeDayComplete({
        requiredModes: ['heardle'],
        completedModes: [],
        exemptModes: ['heardle'],
      }),
    ).toBe(false)
  })
})

describe('isAnyModeDayComplete', () => {
  it('counts any completion including losses', () => {
    expect(isAnyModeDayComplete(['cover'])).toBe(true)
    expect(isAnyModeDayComplete([])).toBe(false)
  })
})

describe('summarizeCommunityStreaks', () => {
  it('applies yesterday grace for current any-streak and tracks full separately', () => {
    const anyDays = ['2026-07-14', '2026-07-15', '2026-07-16']
    const allDays = ['2026-07-15', '2026-07-16']
    const stats = summarizeCommunityStreaks({
      anyDays,
      allDays,
      todayKey: '2026-07-17',
    })
    expect(stats.any.currentStreak).toBe(3)
    expect(stats.any.maxStreak).toBe(3)
    expect(stats.all.currentStreak).toBe(2)
    expect(stats.all.maxStreak).toBe(2)
  })

  it('breaks on UTC gaps', () => {
    const days = ['2026-07-10', '2026-07-11', '2026-07-13']
    expect(hasUtcGap(days)).toBe(true)
    expect(shiftUtcDateKey('2026-07-11', 1)).toBe('2026-07-12')
    const stats = summarizeCommunityStreaks({
      anyDays: days,
      allDays: days,
      todayKey: '2026-07-13',
    })
    expect(stats.any.currentStreak).toBe(1)
    expect(stats.any.maxStreak).toBe(2)
  })
})

describe('filterFromEpoch', () => {
  it('drops pre-launch dates', () => {
    expect(
      filterFromEpoch(['2026-07-01', '2026-07-18', '2026-07-19'], '2026-07-18'),
    ).toEqual(['2026-07-18', '2026-07-19'])
  })
})
