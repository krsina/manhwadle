import { describe, expect, it } from 'vitest'
import {
  PLAY_XP_ALL_MODES_BONUS,
  PLAY_XP_BASE,
  PLAY_XP_DAILY_CAP_MAX,
  PLAY_XP_DAILY_CAP_MIN,
  PLAY_XP_FIRST_TRY_BONUS,
  PLAY_XP_GOLDEN_BONUS,
  PLAY_XP_MODES_PER_DAY,
  PLAYER_LEVEL_CAP,
  daysToAdvanceFromLevel,
  daysToReachLevel,
  expectedDayPlayXp,
  expectedPlayXpAfterDays,
  maxDayPlayXp,
  playXpDailyCap,
  playXpForAllModesDay,
  playXpForGoldenSolve,
  playXpForWin,
  playerLevelFromXp,
  streakXpMultiplier,
  xpThresholdForLevel,
  xpToAdvanceFromLevel,
} from './playerLevel'

describe('playerLevel curve', () => {
  it('starts at level 1 with zero XP', () => {
    expect(playerLevelFromXp(0)).toMatchObject({
      level: 1,
      xpIntoLevel: 0,
      xpForNext: xpToAdvanceFromLevel(1),
      progress: 0,
    })
  })

  it('reaches exactly level 2 after one consistent all-mode day', () => {
    const day1 = expectedPlayXpAfterDays(1)
    expect(day1).toBe(416)
    expect(playerLevelFromXp(day1 - 1).level).toBe(1)
    expect(playerLevelFromXp(day1).level).toBe(2)
    expect(playerLevelFromXp(day1).level).toBeLessThan(3)
  })

  it('reaches exactly level 3 after two consistent all-mode days', () => {
    const day2 = expectedPlayXpAfterDays(2)
    expect(playerLevelFromXp(day2 - 1).level).toBeLessThan(3)
    expect(playerLevelFromXp(day2).level).toBe(3)
  })

  it('uses escalating days-to-advance and gets harder over time', () => {
    expect(daysToAdvanceFromLevel(1)).toBe(1)
    expect(daysToAdvanceFromLevel(2)).toBe(1)
    expect(daysToAdvanceFromLevel(3)).toBe(2)
    expect(daysToAdvanceFromLevel(4)).toBe(2)
    expect(daysToAdvanceFromLevel(5)).toBe(3)
    expect(daysToAdvanceFromLevel(20)).toBeGreaterThan(daysToAdvanceFromLevel(6))
    expect(xpToAdvanceFromLevel(50)).toBeGreaterThan(xpToAdvanceFromLevel(10))
    expect(xpThresholdForLevel(3)).toBe(xpThresholdForLevel(2) + xpToAdvanceFromLevel(2))
  })

  it('hits level 99 in about two years of consistent play', () => {
    const days = daysToReachLevel(PLAYER_LEVEL_CAP)
    expect(days).toBe(748)
    expect(days / 365).toBeGreaterThan(1.9)
    expect(days / 365).toBeLessThan(2.2)

    const toCap = xpThresholdForLevel(PLAYER_LEVEL_CAP)
    expect(toCap).toBe(465_603)
    expect(playerLevelFromXp(toCap).level).toBe(PLAYER_LEVEL_CAP)
    expect(playerLevelFromXp(toCap + 10_000).level).toBe(PLAYER_LEVEL_CAP)
  })

  it('matches the published early timeline milestones', () => {
    expect(daysToReachLevel(2)).toBe(1)
    expect(daysToReachLevel(4)).toBe(4)
    expect(daysToReachLevel(6)).toBe(9)
    expect(daysToReachLevel(10)).toBe(21)
    expect(daysToReachLevel(20)).toBe(65)
    expect(xpThresholdForLevel(2)).toBe(416)
    expect(xpThresholdForLevel(20)).toBe(39_411)
  })
})

describe('play XP awards', () => {
  it('scales streak multiplier from 1.0 up to 1.5', () => {
    expect(streakXpMultiplier(0)).toBe(1)
    expect(streakXpMultiplier(1)).toBe(1)
    expect(streakXpMultiplier(2)).toBeCloseTo(1.05)
    expect(streakXpMultiplier(11)).toBe(1.5)
    expect(streakXpMultiplier(30)).toBe(1.5)
  })

  it('keeps first-try + golden + all-modes within 10% of normal clears', () => {
    const normal = PLAY_XP_BASE * PLAY_XP_MODES_PER_DAY
    const stacked =
      (PLAY_XP_BASE + PLAY_XP_FIRST_TRY_BONUS + PLAY_XP_GOLDEN_BONUS) *
        PLAY_XP_MODES_PER_DAY +
      PLAY_XP_ALL_MODES_BONUS
    expect(normal).toBe(400)
    expect(stacked).toBe(440)
    expect(stacked / normal).toBeCloseTo(1.1)

    expect(playXpForWin({ firstTry: false, anyCurrentStreak: 1 })).toBe(100)
    expect(playXpForWin({ firstTry: true, anyCurrentStreak: 1 })).toBe(103)
    expect(playXpForGoldenSolve(1)).toBe(3)
    expect(playXpForAllModesDay(1)).toBe(16)
    expect(expectedDayPlayXp(1)).toBe(416)
    expect(maxDayPlayXp(1)).toBe(440)
  })

  it('clamps the daily anticheat cap between 478 and 759', () => {
    expect(playXpDailyCap(1)).toBe(520)
    expect(playXpDailyCap(1)).toBeGreaterThanOrEqual(PLAY_XP_DAILY_CAP_MIN)
    expect(playXpDailyCap(50)).toBe(PLAY_XP_DAILY_CAP_MAX)
    expect(playXpDailyCap(98)).toBe(PLAY_XP_DAILY_CAP_MAX)
  })
})
