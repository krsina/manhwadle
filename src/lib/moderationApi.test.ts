import { describe, expect, it } from 'vitest'
import {
  canUseModerationUi,
  endsAtFromHours,
  parseModerationNewsComment,
  parseUserLookup,
  TEMP_DURATION_OPTIONS,
} from './moderationApi'

describe('moderationApi helpers', () => {
  it('gates the moderation area on a server-reported staff role', () => {
    expect(canUseModerationUi('owner')).toBe(true)
    expect(canUseModerationUi('moderator')).toBe(true)
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

  it('parses quarantined comments with private filter metadata', () => {
    expect(
      parseModerationNewsComment({
        id: '11111111-1111-1111-1111-111111111111',
        author_id: '22222222-2222-2222-2222-222222222222',
        username: 'HeldUser',
        body: 'https://example.com/review',
        status: 'pending',
        created_at: '2026-08-11T12:00:00Z',
        updated_at: '2026-08-11T12:00:00Z',
        post_id: '33333333-3333-3333-3333-333333333333',
        post_title: 'Update',
        post_slug: 'update',
        filter_category: 'external_link',
        filter_rule: 'single_external_link',
      }),
    ).toMatchObject({
      status: 'pending',
      filterCategory: 'external_link',
      filterRule: 'single_external_link',
    })
  })
})
