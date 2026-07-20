import { describe, expect, it } from 'vitest'
import {
  canUseModerationUi,
  endsAtFromHours,
  parseUserLookup,
  TEMP_DURATION_OPTIONS,
} from './moderationApi'

describe('moderationApi helpers', () => {
  it('gates dashboard on server-reported owner role only', () => {
    expect(canUseModerationUi('owner')).toBe(true)
    expect(canUseModerationUi('moderator')).toBe(false)
    expect(canUseModerationUi(null)).toBe(false)
    expect(canUseModerationUi('admin')).toBe(false)
    expect(canUseModerationUi(undefined)).toBe(false)
  })

  it('parses exact username lookup payloads', () => {
    const parsed = parseUserLookup({
      ok: true,
      user_id: '11111111-1111-1111-1111-111111111111',
      username: 'Kris',
      username_normalized: 'kris',
      staff_role: null,
      cloud_banned: false,
      leaderboard_excluded: true,
      force_username_change: false,
    })
    expect(parsed).toMatchObject({
      ok: true,
      username: 'Kris',
      leaderboard_excluded: true,
      staff_role: null,
    })
  })

  it('rejects failed lookups', () => {
    expect(parseUserLookup({ ok: false, error: 'not_found' })).toMatchObject({
      ok: false,
      error: 'not_found',
    })
    expect(parseUserLookup(null)).toBeNull()
  })

  it('builds temporary expiry timestamps from duration presets', () => {
    expect(TEMP_DURATION_OPTIONS.map((o) => o.hours)).toEqual([24, 168, 336, 720])
    const iso = endsAtFromHours(24)
    expect(Number.isNaN(Date.parse(iso))).toBe(false)
    expect(Date.parse(iso)).toBeGreaterThan(Date.now())
  })
})
