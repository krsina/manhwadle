import { describe, expect, it } from 'vitest'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import { DEFAULT_STAGE_ID } from './avatarStages'
import { parseAccountSnapshot } from './profileApi'

describe('parseAccountSnapshot', () => {
  it('maps RPC payload fields including the equipped avatar and stage ids', () => {
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
      points_balance: 135,
      lifetime_earned: 200,
      equipped_avatar_id: 'avatar_shadow_hunter',
      equipped_stage_id: 'stage_sky_meadow',
      equipped_awakening_level: 2,
    })
    expect(snap).toMatchObject({
      username: 'Kris',
      needsUsername: false,
      canChangeUsername: true,
      readerTaste: 'action',
      staffRole: null,
      cloudBanned: false,
      pointsBalance: 135,
      lifetimeEarned: 200,
      equippedAvatarId: 'avatar_shadow_hunter',
      equippedStageId: 'stage_sky_meadow',
    })
    expect(snap).not.toHaveProperty('equippedAwakeningLevel')
  })

  it('maps staff role and ban flags from server with the default avatar', () => {
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
      pointsBalance: 0,
      lifetimeEarned: 0,
      equippedAvatarId: DEFAULT_AVATAR_ID,
      equippedStageId: DEFAULT_STAGE_ID,
    })
    expect(snap).not.toHaveProperty('equippedAwakeningLevel')
  })

  it('normalizes an unknown equipped avatar id to the default', () => {
    const snap = parseAccountSnapshot({
      ok: true,
      user_id: '11111111-1111-1111-1111-111111111111',
      username: 'Legacy',
      equipped_avatar_id: 'avatar_sora',
      equipped_stage_id: 'not-a-stage',
    })
    expect(snap?.equippedAvatarId).toBe(DEFAULT_AVATAR_ID)
    expect(snap?.equippedStageId).toBe(DEFAULT_STAGE_ID)
  })

  it('returns null for failed payloads', () => {
    expect(parseAccountSnapshot({ ok: false, error: 'not_authenticated' })).toBeNull()
    expect(parseAccountSnapshot(null)).toBeNull()
  })
})
