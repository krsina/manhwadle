import { describe, expect, it } from 'vitest'
import {
  AVATAR_CHARACTER_META,
  DEFAULT_AVATAR_ID,
  STYLE_A_BASE,
  avatarAssetUrl,
  compareShopItemsByPrice,
  describeAvatar,
  getAvatarCharacterMeta,
  limitedTimeAvatarIds,
  normalizeEquippedAvatarId,
  starterAvatarIds,
} from './avatarComposition'

const STARTER_IDS = ['avatar_default_female', 'avatar_default_male'] as const
const LIMITED_TIME_IDS = ['avatar_quest_recruit', 'avatar_spark_apprentice'] as const
const LEGACY_PREMIUM_IDS = ['avatar_shadow_hunter', 'avatar_skybreaker_monk'] as const
const WAVE1_IDS = [
  'avatar_plum_blossom_blade',
  'avatar_tower_ranker',
  'avatar_fourth_wall_reader',
  'avatar_absolute_regressor',
  'avatar_ice_sovereign',
  'avatar_flame_returnee',
  'avatar_blood_contract',
  'avatar_heavenly_demon',
  'avatar_academy_prodigy',
  'avatar_undead_marshal',
  'avatar_beast_pact_hunter',
  'avatar_villainess_rose',
] as const

describe('avatarComposition', () => {
  it('exposes the whole-character catalog contract including wave-1 and limited-time claims', () => {
    expect(AVATAR_CHARACTER_META).toHaveLength(18)
    expect(AVATAR_CHARACTER_META.map((character) => character.id)).toEqual([
      ...LIMITED_TIME_IDS,
      ...STARTER_IDS,
      ...LEGACY_PREMIUM_IDS,
      ...WAVE1_IDS,
    ])
    expect(DEFAULT_AVATAR_ID).toBe('avatar_default_female')
    expect(AVATAR_CHARACTER_META.filter((character) => character.starter)).toHaveLength(2)
    expect(AVATAR_CHARACTER_META.filter((character) => character.limitedTime)).toHaveLength(2)
    expect(AVATAR_CHARACTER_META.filter((character) => character.price > 0)).toHaveLength(14)
    expect(AVATAR_CHARACTER_META.filter((character) => character.rarity === 'epic')).toHaveLength(3)
  })

  it('prices and rarities match the product contract', () => {
    const shadowHunter = getAvatarCharacterMeta('avatar_shadow_hunter')
    const skybreakerMonk = getAvatarCharacterMeta('avatar_skybreaker_monk')
    expect(shadowHunter).toMatchObject({ price: 4000, rarity: 'rare', starter: false })
    expect(skybreakerMonk).toMatchObject({ price: 4000, rarity: 'rare', starter: false })
    expect(getAvatarCharacterMeta('avatar_ice_sovereign')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
    })
    expect(getAvatarCharacterMeta('avatar_heavenly_demon')).toMatchObject({
      price: 7000,
      rarity: 'epic',
    })
    expect(getAvatarCharacterMeta('avatar_undead_marshal')).toMatchObject({
      price: 7000,
      rarity: 'epic',
    })
    const defaultFemale = getAvatarCharacterMeta(DEFAULT_AVATAR_ID)
    const defaultMale = getAvatarCharacterMeta('avatar_default_male')
    expect(defaultFemale).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: true,
      description: 'A plain starter look',
    })
    expect(defaultMale).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: true,
      description: 'A plain starter look',
    })
    expect(getAvatarCharacterMeta('avatar_quest_recruit')).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: false,
      limitedTime: true,
    })
    expect(getAvatarCharacterMeta('avatar_spark_apprentice')).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: false,
      limitedTime: true,
    })
  })

  it('returns null for unknown character ids', () => {
    expect(getAvatarCharacterMeta('not-a-character')).toBeNull()
    expect(getAvatarCharacterMeta(null)).toBeNull()
    expect(getAvatarCharacterMeta(undefined)).toBeNull()
  })

  it('normalizes unknown/missing ids to the default avatar', () => {
    expect(normalizeEquippedAvatarId(null)).toBe(DEFAULT_AVATAR_ID)
    expect(normalizeEquippedAvatarId(undefined)).toBe(DEFAULT_AVATAR_ID)
    expect(normalizeEquippedAvatarId('not-a-character')).toBe(DEFAULT_AVATAR_ID)
    expect(normalizeEquippedAvatarId('avatar_shadow_hunter')).toBe('avatar_shadow_hunter')
  })

  it('describes known avatars by name and falls back safely', () => {
    expect(describeAvatar('avatar_shadow_hunter')).toBe('Shadow Hunter')
    expect(describeAvatar('avatar_skybreaker_monk')).toBe('Skybreaker Monk')
    expect(describeAvatar('avatar_villainess_rose')).toBe('Villainess Rose')
    expect(describeAvatar('not-a-character')).toBe(describeAvatar(DEFAULT_AVATAR_ID))
  })

  it('lists starter ids as the two free defaults', () => {
    expect(starterAvatarIds().sort()).toEqual(['avatar_default_female', 'avatar_default_male'])
  })

  it('lists limited-time claim ids separately from starters', () => {
    expect(limitedTimeAvatarIds().sort()).toEqual([
      'avatar_quest_recruit',
      'avatar_spark_apprentice',
    ])
  })

  it('sorts shop items by price with limited-time free claims first', () => {
    const sorted = [
      { id: 'avatar_shadow_hunter', price: 4000 },
      { id: 'avatar_default_female', price: 0 },
      { id: 'avatar_quest_recruit', price: 0, limitedTime: true },
      { id: 'avatar_ice_sovereign', price: 7000 },
      { id: 'avatar_spark_apprentice', price: 0, limitedTime: true },
    ].sort(compareShopItemsByPrice)
    expect(sorted.map((row) => row.id)).toEqual([
      'avatar_quest_recruit',
      'avatar_spark_apprentice',
      'avatar_default_female',
      'avatar_shadow_hunter',
      'avatar_ice_sovereign',
    ])
  })

  it('resolves asset URLs under the Style A base path', () => {
    expect(avatarAssetUrl('avatar_default_female')).toBe(`${STYLE_A_BASE}/default-female.png?v=5`)
    expect(avatarAssetUrl('avatar_shadow_hunter')).toBe(`${STYLE_A_BASE}/shadow-hunter.png?v=5`)
    expect(avatarAssetUrl('avatar_ice_sovereign')).toBe(`${STYLE_A_BASE}/ice-sovereign.png?v=5`)
    expect(avatarAssetUrl('avatar_quest_recruit')).toBe(`${STYLE_A_BASE}/quest-recruit.png?v=5`)
    expect(avatarAssetUrl('not-a-character')).toBe(avatarAssetUrl(DEFAULT_AVATAR_ID))
  })
})
