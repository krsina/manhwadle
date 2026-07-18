import { describe, expect, it } from 'vitest'
import { parseAccountSnapshot } from './profileApi'

describe('parseAccountSnapshot', () => {
  it('maps RPC payload fields', () => {
    const snap = parseAccountSnapshot({
      ok: true,
      user_id: '11111111-1111-1111-1111-111111111111',
      username: 'Kris',
      username_normalized: 'kris',
      username_change_required: false,
      needs_username: false,
      username_changed_at: null,
      next_change_at: null,
      can_change_username: true,
      reader_taste: 'action',
    })
    expect(snap).toMatchObject({
      username: 'Kris',
      needsUsername: false,
      canChangeUsername: true,
      readerTaste: 'action',
      staffRole: null,
      cloudBanned: false,
    })
  })

  it('maps staff role and ban flags from server', () => {
    const snap = parseAccountSnapshot({
      ok: true,
      user_id: '11111111-1111-1111-1111-111111111111',
      username: null,
      username_change_required: true,
      needs_username: true,
      staff_role: 'moderator',
      cloud_banned: true,
      leaderboard_excluded: true,
      can_appear_publicly: false,
    })
    expect(snap).toMatchObject({
      staffRole: 'moderator',
      cloudBanned: true,
      usernameChangeRequired: true,
      canAppearPublicly: false,
    })
  })

  it('returns null for failed payloads', () => {
    expect(parseAccountSnapshot({ ok: false, error: 'not_authenticated' })).toBeNull()
    expect(parseAccountSnapshot(null)).toBeNull()
  })
})
