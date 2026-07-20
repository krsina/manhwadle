import { describe, expect, it } from 'vitest'
import { AVATAR_CHARACTER_META } from './avatarComposition'
import {
  AWAKENING_CATALOG_FALLBACK,
  AWAKENING_PRICE,
  AVATAR_AWAKENINGS_ENABLED,
  awakenableAvatarIds,
  awakeningItemId,
  canPurchaseAwakening,
  getAwakenedSheet,
  hasAwakenedSpriteSheet,
  isAwakenableAvatar,
  normalizeAwakeningLevel,
  parseAwakeningItemId,
  resolveAvatarPresentation,
} from './avatarAwakening'

describe('avatarAwakening', () => {
  it('lists every premium catalog character as awakenable', () => {
    const premium = AVATAR_CHARACTER_META.filter((row) => !row.starter && row.price > 0)
    expect(premium.length).toBeGreaterThan(0)
    expect(awakenableAvatarIds()).toEqual(premium.map((row) => row.id))
    for (const row of premium) {
      expect(isAwakenableAvatar(row.id)).toBe(true)
    }
  })

  it('keeps starters static and non-awakenable', () => {
    expect(isAwakenableAvatar('avatar_default_female')).toBe(false)
    expect(isAwakenableAvatar('avatar_default_male')).toBe(false)
    expect(resolveAvatarPresentation('avatar_default_female', 2).awakeningLevel).toBe(0)
    expect(resolveAvatarPresentation('avatar_default_female', 2).useSpriteSheet).toBe(false)
  })

  it('builds a single Awakening offline catalog row per premium avatar', () => {
    const premiumCount = AVATAR_CHARACTER_META.filter((row) => !row.starter && row.price > 0).length
    expect(AWAKENING_CATALOG_FALLBACK).toHaveLength(premiumCount)
    const shadow = AWAKENING_CATALOG_FALLBACK.find(
      (row) => row.id === awakeningItemId('avatar_shadow_hunter'),
    )
    expect(shadow).toMatchObject({
      parentItemId: 'avatar_shadow_hunter',
      awakeningTier: 1,
      name: 'Awakening',
      price: AWAKENING_PRICE,
      rarity: 'rare',
    })
    expect(
      AWAKENING_CATALOG_FALLBACK.some((row) => row.id.endsWith('_2')),
    ).toBe(false)
  })

  it('parses awakening item ids and clamps levels to 0|1', () => {
    expect(parseAwakeningItemId('awaken_avatar_shadow_hunter_1')).toEqual({
      parentItemId: 'avatar_shadow_hunter',
      awakeningTier: 1,
    })
    expect(parseAwakeningItemId('awaken_avatar_ice_sovereign_2')).toEqual({
      parentItemId: 'avatar_ice_sovereign',
      awakeningTier: 1,
    })
    expect(parseAwakeningItemId('avatar_shadow_hunter')).toBeNull()
    expect(normalizeAwakeningLevel(2)).toBe(1)
    expect(normalizeAwakeningLevel('1')).toBe(1)
    expect(normalizeAwakeningLevel(9)).toBe(0)
  })

  it('gates purchases: disabled in production, then parent / already owned', () => {
    expect(
      canPurchaseAwakening({ parentOwned: true, currentLevel: 0 }),
    ).toEqual({ ok: false, error: 'disabled' })
  })

  it('keeps Plum sheet registry empty while awakenings are disabled', () => {
    expect(AVATAR_AWAKENINGS_ENABLED).toBe(false)
    expect(getAwakenedSheet('avatar_plum_blossom_blade')).toBeNull()
    expect(hasAwakenedSpriteSheet('avatar_plum_blossom_blade')).toBe(false)

    const base = resolveAvatarPresentation('avatar_plum_blossom_blade', 0)
    expect(base.useSpriteSheet).toBe(false)
    expect(base.src).toContain('plum-blossom-blade.png')
    expect(base.src).not.toContain('/awakened/')

    const awakened = resolveAvatarPresentation('avatar_plum_blossom_blade', 1)
    expect(awakened).toMatchObject({
      awakeningLevel: 0,
      useSpriteSheet: false,
      frameCount: 1,
    })
    expect(awakened.src).not.toContain('/awakened/')
  })

  it('keeps unregistered awakenings on the static plate (no FX fields)', () => {
    expect(hasAwakenedSpriteSheet('avatar_flame_returnee')).toBe(false)
    const awakened = resolveAvatarPresentation('avatar_flame_returnee', 1)
    expect(awakened.awakeningLevel).toBe(0)
    expect(awakened.useSpriteSheet).toBe(false)
    expect(awakened.frameCount).toBe(1)
    expect(awakened.src).toContain('flame-returnee.png')
    expect(awakened).not.toHaveProperty('fxTheme')
  })
})
