import { describe, expect, it } from 'vitest'
import {
  parseMyLeaderboardStanding,
  parseMyLevelRank,
  parsePublicSiteStatus,
} from './leaderboardApi'

describe('parsePublicSiteStatus', () => {
  it('maps banner and mode availability', () => {
    const status = parsePublicSiteStatus({
      ok: true,
      banner_message: 'Clip delay',
      banner_severity: 'warning',
      maintenance_active: false,
      leaderboard_epoch_date: '2026-07-18',
      modes: [
        { mode: 'summary', available: true, message: null },
        { mode: 'heardle', available: false, message: 'Offline' },
      ],
    })
    expect(status?.bannerMessage).toBe('Clip delay')
    expect(status?.bannerSeverity).toBe('warning')
    expect(status?.modes.find((m) => m.mode === 'heardle')?.available).toBe(false)
  })
})

describe('parseMyLeaderboardStanding', () => {
  it('keeps public-safe fields only', () => {
    const standing = parseMyLeaderboardStanding({
      ok: true,
      eligible: true,
      username: 'ReaderOne',
      any_current_streak: 3,
      any_max_streak: 5,
      all_current_streak: 2,
      all_max_streak: 2,
      total_completions: 12,
      boards: {
        current_streak: { value: 3, rank: 4 },
        longest_streak: { value: 5, rank: 2 },
        all_mode_streak: { value: 2, rank: 1 },
      },
    })
    expect(standing?.eligible).toBe(true)
    expect(standing?.boards.current_streak).toEqual({ value: 3, rank: 4 })
    expect(standing && 'user_id' in standing).toBe(false)
  })

  it('rejects rate-limited / error payloads', () => {
    expect(parseMyLeaderboardStanding({ ok: false, error: 'rate_limited' })).toBeNull()
    expect(parseMyLeaderboardStanding({ ok: false, error: 'auth_required' })).toBeNull()
  })
})

describe('parseMyLevelRank', () => {
  it('maps lifetime XP dense rank', () => {
    expect(
      parseMyLevelRank({
        ok: true,
        eligible: true,
        lifetime_earned: 120,
        rank: 7,
      }),
    ).toEqual({ eligible: true, lifetimeEarned: 120, rank: 7 })
  })

  it('treats missing or non-positive rank as unranked', () => {
    expect(
      parseMyLevelRank({
        ok: true,
        eligible: false,
        lifetime_earned: 0,
        rank: null,
      }),
    ).toEqual({ eligible: false, lifetimeEarned: 0, rank: null })
    expect(parseMyLevelRank({ ok: true, eligible: true, lifetime_earned: 5 })).toEqual({
      eligible: true,
      lifetimeEarned: 5,
      rank: null,
    })
  })
})

/**
 * Mirrors server-side is_leaderboard_eligible exclusions for documentation/tests.
 * Public username + not banned/excluded/forced-rename/test/suspicious.
 */
function isEligibleForBoards(flags: {
  hasUsername: boolean
  usernameChangeRequired: boolean
  cloudBanned: boolean
  leaderboardExcluded: boolean
  isTest: boolean
  isSuspicious: boolean
}): boolean {
  return (
    flags.hasUsername &&
    !flags.usernameChangeRequired &&
    !flags.cloudBanned &&
    !flags.leaderboardExcluded &&
    !flags.isTest &&
    !flags.isSuspicious
  )
}

describe('leaderboard eligibility exclusions', () => {
  it('excludes restricted and flagged accounts', () => {
    const base = {
      hasUsername: true,
      usernameChangeRequired: false,
      cloudBanned: false,
      leaderboardExcluded: false,
      isTest: false,
      isSuspicious: false,
    }
    expect(isEligibleForBoards(base)).toBe(true)
    expect(isEligibleForBoards({ ...base, hasUsername: false })).toBe(false)
    expect(isEligibleForBoards({ ...base, cloudBanned: true })).toBe(false)
    expect(isEligibleForBoards({ ...base, leaderboardExcluded: true })).toBe(false)
    expect(isEligibleForBoards({ ...base, usernameChangeRequired: true })).toBe(false)
    expect(isEligibleForBoards({ ...base, isTest: true })).toBe(false)
    expect(isEligibleForBoards({ ...base, isSuspicious: true })).toBe(false)
  })
})
