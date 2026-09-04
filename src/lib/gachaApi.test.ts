import { describe, expect, it } from 'vitest'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import { emptyGachaPity } from './gacha'
import { parseGachaStateSnapshot, gachaErrorMessage, guestGachaState, clientWeeklyFeatured } from './gachaApi'

describe('parseGachaStateSnapshot', () => {
  it('maps pity, owned copies, featured skins, and the last pull', () => {
    const state = parseGachaStateSnapshot({
      ok: true,
      authenticated: true,
      balance: 800,
      equipped_avatar_id: DEFAULT_AVATAR_ID,
      pity: { pullCount: 12, pullsSinceRarePlus: 2 },
      owned: { [DEFAULT_AVATAR_ID]: 1, avatar_shadow_hunter: 3 },
      last_result: { characterId: 'avatar_shadow_hunter', rarity: 'rare', isNew: false },
      featured: [{ id: 'avatar_shadow_hunter', rarity: 'rare', price: 2000 }],
    })
    expect(state).toMatchObject({
      authenticated: true,
      balance: 800,
      pity: { pullCount: 12, pullsSinceRarePlus: 2 },
      owned: expect.objectContaining({ avatar_shadow_hunter: 3 }),
      lastResult: { characterId: 'avatar_shadow_hunter', rarity: 'rare', isNew: false },
    })
    expect(state?.featured[0]).toMatchObject({ id: 'avatar_shadow_hunter', price: 2000 })
  })

  it('keeps starter copies when the server omits owned', () => {
    const state = parseGachaStateSnapshot({
      ok: true,
      pity: emptyGachaPity(),
      owned: {},
      featured: [],
    })
    expect(state?.owned[DEFAULT_AVATAR_ID]).toBe(1)
  })

  it('rejects failed payloads', () => {
    expect(parseGachaStateSnapshot({ ok: false, error: 'not_authenticated' })).toBeNull()
  })
})

describe('gachaErrorMessage', () => {
  it('explains auth, points, and catalog retirement', () => {
    expect(gachaErrorMessage('not_authenticated')).toMatch(/sign in/i)
    expect(gachaErrorMessage('insufficient_points')).toMatch(/enough points/i)
    expect(gachaErrorMessage('gacha_only')).toMatch(/banner/i)
    expect(gachaErrorMessage('rate_limited')).toMatch(/wait/i)
  })
})

describe('guestGachaState', () => {
  it('starts guests with starter copies and this week\'s featured skins', () => {
    const state = guestGachaState()
    expect(state.authenticated).toBe(false)
    expect(state.owned[DEFAULT_AVATAR_ID]).toBe(1)
    expect(state.featured).toHaveLength(4)
    expect(clientWeeklyFeatured()).toHaveLength(4)
  })
})
