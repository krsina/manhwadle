import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import {
  AVATAR_CATALOG_FALLBACK,
  STAGE_CATALOG_FALLBACK,
  equipAvatar,
  equipStage,
  parseAvatarShopSnapshot,
  purchaseAvatar,
  purchaseShopItem,
} from './avatarShop'
import { DEFAULT_STAGE_ID } from './avatarStages'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

describe('parseAvatarShopSnapshot', () => {
  it('parses the whole-character catalog, stages, balance, and equipped ids', () => {
    const shop = parseAvatarShopSnapshot({
      ok: true,
      authenticated: true,
      balance: 125,
      equipped_avatar_id: 'avatar_shadow_hunter',
      equipped_stage_id: 'stage_sky_meadow',
      equipped_awakening_level: 1,
      items: [
        {
          id: 'avatar_shadow_hunter',
          name: 'Shadow Hunter',
          description: 'Dual daggers and a shadow aura.',
          price: 150,
          rarity: 'rare',
          asset_key: 'avatar_shadow_hunter',
          owned: true,
          equipped: true,
          awakening_level: 1,
        },
      ],
      stages: [
        {
          id: 'stage_sky_meadow',
          name: 'Sky Meadow',
          description: 'Pastoral meadow.',
          price: 100,
          rarity: 'rare',
          asset_key: 'stage_sky_meadow',
          owned: true,
          equipped: true,
        },
      ],
      awakenings: [
        {
          id: 'awaken_avatar_shadow_hunter_1',
          name: 'Awakening I',
          description: 'Idle motion.',
          price: 100,
          rarity: 'rare',
          asset_key: 'awaken_avatar_shadow_hunter_1',
          parent_item_id: 'avatar_shadow_hunter',
          awakening_tier: 1,
          owned: true,
        },
      ],
    })

    expect(shop?.authenticated).toBe(true)
    expect(shop?.balance).toBe(125)
    expect(shop?.equippedAvatarId).toBe('avatar_shadow_hunter')
    expect(shop?.equippedStageId).toBe('stage_sky_meadow')
    const shadowHunter = shop?.items.find((item) => item.id === 'avatar_shadow_hunter')
    expect(shadowHunter).toMatchObject({
      name: 'Shadow Hunter',
      price: 150,
      rarity: 'rare',
      assetKey: 'avatar_shadow_hunter',
      owned: true,
      equipped: true,
    })
    expect(shop?.stages.find((item) => item.id === 'stage_sky_meadow')?.equipped).toBe(true)
    // Signed-in snapshots stay server-authoritative — no client catalog merge.
    expect(shop?.items).toHaveLength(1)
    expect(shop?.stages).toHaveLength(1)
    expect(shop?.stages.some((item) => item.id === DEFAULT_STAGE_ID)).toBe(false)
    // Legacy awakening keys on an older server payload are ignored, not surfaced.
    expect(shop).not.toHaveProperty('awakenings')
    expect(shop).not.toHaveProperty('equippedAwakeningLevel')
    expect(shadowHunter).not.toHaveProperty('awakeningLevel')
  })

  it('merges the offline catalog for guest snapshots only', () => {
    const shop = parseAvatarShopSnapshot({
      ok: true,
      authenticated: false,
      balance: -20,
      items: [
        { id: 'bad', rarity: 'mythic' },
        {
          id: 'avatar_default_female',
          name: 'Default (Female)',
          asset_key: 'avatar_default_female',
          rarity: 'starter',
          price: 0,
          owned: true,
        },
      ],
    })

    expect(shop?.balance).toBe(0)
    expect(shop?.equippedAvatarId).toBe(DEFAULT_AVATAR_ID)
    expect(shop?.equippedStageId).toBe(DEFAULT_STAGE_ID)
    expect(shop?.items.some((item) => item.id === 'avatar_default_female')).toBe(true)
    expect(shop?.items.some((item) => item.id === 'avatar_explorer_a')).toBe(true)
    expect(shop?.items.some((item) => item.id === 'bad')).toBe(false)
    expect(shop?.stages).toHaveLength(3)
  })

  it('does not inject client-only explorers into signed-in snapshots', () => {
    const shop = parseAvatarShopSnapshot({
      ok: true,
      authenticated: true,
      balance: 10,
      equipped_avatar_id: DEFAULT_AVATAR_ID,
      equipped_stage_id: DEFAULT_STAGE_ID,
      items: [
        {
          id: DEFAULT_AVATAR_ID,
          name: 'Default (Female)',
          asset_key: DEFAULT_AVATAR_ID,
          rarity: 'starter',
          price: 0,
          owned: true,
          equipped: true,
        },
      ],
      stages: [
        {
          id: DEFAULT_STAGE_ID,
          name: 'Blossom Courtyard',
          asset_key: DEFAULT_STAGE_ID,
          rarity: 'common',
          price: 0,
          owned: true,
          equipped: true,
        },
      ],
    })

    expect(shop?.items.map((item) => item.id)).toEqual([DEFAULT_AVATAR_ID])
    expect(shop?.stages.map((item) => item.id)).toEqual([DEFAULT_STAGE_ID])
    expect(shop?.items.some((item) => item.id === 'avatar_explorer_a')).toBe(false)
  })

  it('rejects failed and malformed responses', () => {
    expect(parseAvatarShopSnapshot({ ok: false, items: [] })).toBeNull()
    expect(parseAvatarShopSnapshot({ ok: true, items: null })).toBeNull()
  })

  it('ships the full Style A catalog offline, with both defaults owned', () => {
    expect(AVATAR_CATALOG_FALLBACK).toHaveLength(80)
    expect(AVATAR_CATALOG_FALLBACK.filter((item) => item.owned)).toHaveLength(2)
    expect(AVATAR_CATALOG_FALLBACK.filter((item) => item.limitedTime)).toHaveLength(2)
    expect(AVATAR_CATALOG_FALLBACK.slice(0, 2).map((item) => item.id)).toEqual([
      'avatar_explorer_a',
      'avatar_explorer_b',
    ])
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === DEFAULT_AVATAR_ID)?.equipped).toBe(
      true,
    )
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_ember_crown')).toMatchObject({
      name: 'Ember Crown',
      price: 7000,
      rarity: 'epic',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_white_coat_incarnation')).toMatchObject({
      name: 'White Coat Incarnation',
      price: 7000,
      rarity: 'epic',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_black_coat_incarnation')).toMatchObject({
      name: 'Black Coat Incarnation',
      price: 7000,
      rarity: 'epic',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_scarlet_cape_heir')).toMatchObject({
      name: 'Scarlet Cape Heir',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_pinkburst_mage')).toMatchObject({
      name: 'Pinkburst Mage',
      price: 7000,
      rarity: 'epic',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_shawl_spirit_medium')).toMatchObject({
      name: 'Shawl Spirit Medium',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_white_bloom_saintess')).toMatchObject({
      name: 'White Bloom Saintess',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_ice_huntress_knight')).toMatchObject({
      name: 'Ice Huntress Knight',
      price: 4000,
      rarity: 'rare',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_monster_arm_survivor')).toMatchObject({
      name: 'Monster Arm Survivor',
      price: 7000,
      rarity: 'epic',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_violet_beret_mage')).toMatchObject({
      name: 'Violet Beret Mage',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_stonehammer_barbarian')).toMatchObject({
      name: 'Stonehammer Barbarian',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_ashbloom_mercenary')).toMatchObject({
      name: 'Ashbloom Mercenary',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_crimson_tip_maid')).toMatchObject({
      name: 'Crimson-Tip Maid',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_hollow_gaze_boxer')).toMatchObject({
      name: 'Hollow Gaze Boxer',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(AVATAR_CATALOG_FALLBACK.find((item) => item.id === 'avatar_silent_plum_blade')).toMatchObject({
      name: 'Silent Plum Blade',
      price: 10000,
      rarity: 'legendary',
      owned: false,
    })
    expect(STAGE_CATALOG_FALLBACK).toHaveLength(3)
    expect(STAGE_CATALOG_FALLBACK.filter((item) => item.owned)).toHaveLength(1)
    expect(STAGE_CATALOG_FALLBACK.filter((item) => item.limitedTime)).toHaveLength(1)
    expect(STAGE_CATALOG_FALLBACK.find((item) => item.id === 'stage_sky_meadow')).toMatchObject({
      price: 0,
      limitedTime: true,
      owned: false,
    })
    expect(STAGE_CATALOG_FALLBACK[0]?.id).toBe('stage_sky_meadow')
  })
})

describe('avatar shop mutations', () => {
  beforeEach(() => rpc.mockReset())

  it('purchases through purchase_shop_item and parses the new balance', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, item_id: 'avatar_shadow_hunter', balance: 65 },
      error: null,
    })

    await expect(purchaseShopItem('avatar_shadow_hunter')).resolves.toEqual({
      ok: true,
      itemId: 'avatar_shadow_hunter',
      balance: 65,
    })
    expect(rpc).toHaveBeenCalledWith('purchase_shop_item', { p_item_id: 'avatar_shadow_hunter' })
  })

  it('exposes purchaseAvatar as an alias of purchaseShopItem', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, item_id: 'avatar_skybreaker_monk', balance: 50 },
      error: null,
    })

    await expect(purchaseAvatar('avatar_skybreaker_monk')).resolves.toEqual({
      ok: true,
      itemId: 'avatar_skybreaker_monk',
      balance: 50,
    })
    expect(rpc).toHaveBeenCalledWith('purchase_shop_item', { p_item_id: 'avatar_skybreaker_monk' })
  })

  it('equips an owned character through equip_avatar', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, equipped_avatar_id: 'avatar_skybreaker_monk' },
      error: null,
    })

    await expect(equipAvatar('avatar_skybreaker_monk')).resolves.toEqual({
      ok: true,
      equippedAvatarId: 'avatar_skybreaker_monk',
    })
    expect(rpc).toHaveBeenCalledWith('equip_avatar', { p_item_id: 'avatar_skybreaker_monk' })
  })

  it('equips an owned stage through equip_stage', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, equipped_stage_id: 'stage_dusk_plaza' },
      error: null,
    })

    await expect(equipStage('stage_dusk_plaza')).resolves.toEqual({
      ok: true,
      equippedStageId: 'stage_dusk_plaza',
    })
    expect(rpc).toHaveBeenCalledWith('equip_stage', { p_item_id: 'stage_dusk_plaza' })
  })

  it('surfaces a friendly ownership error from equip', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, error: 'not_owned' },
      error: null,
    })

    await expect(equipAvatar('avatar_shadow_hunter')).resolves.toEqual({
      ok: false,
      error: 'Purchase this item before equipping it.',
    })
  })
})
