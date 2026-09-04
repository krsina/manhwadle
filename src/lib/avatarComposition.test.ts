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
const LIMITED_TIME_IDS = ['avatar_explorer_a', 'avatar_explorer_b'] as const
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
const EMBER_CROWN_IDS = ['avatar_ember_crown'] as const
const WHITE_COAT_INCARNATION_IDS = ['avatar_white_coat_incarnation'] as const
const BLACK_COAT_INCARNATION_IDS = ['avatar_black_coat_incarnation'] as const
const SCARLET_CAPE_HEIR_IDS = ['avatar_scarlet_cape_heir'] as const
const PINKBURST_MAGE_IDS = ['avatar_pinkburst_mage'] as const
const SHAWL_SPIRIT_MEDIUM_IDS = ['avatar_shawl_spirit_medium'] as const
const WHITE_BLOOM_SAINTESS_IDS = ['avatar_white_bloom_saintess'] as const
const VIOLET_BERET_MAGE_IDS = ['avatar_violet_beret_mage'] as const
const STONEHAMMER_BARBARIAN_IDS = ['avatar_stonehammer_barbarian'] as const
const ASHBLOOM_MERCENARY_IDS = ['avatar_ashbloom_mercenary'] as const
const CRIMSON_TIP_MAID_IDS = ['avatar_crimson_tip_maid'] as const
const HOLLOW_GAZE_BOXER_IDS = ['avatar_hollow_gaze_boxer'] as const
const SILENT_PLUM_BLADE_IDS = ['avatar_silent_plum_blade'] as const
const POPULAR_WAVE_IDS = [
  'avatar_ice_huntress_knight',
  'avatar_obsidian_plume_knight',
  'avatar_black_thorn_climber',
  'avatar_azure_ice_prince',
  'avatar_fishnet_princess',
  'avatar_soul_mask_ranker',
  'avatar_copycat_hunter',
  'avatar_ink_star_author',
  'avatar_worldfall_spear',
  'avatar_banner_commander',
  'avatar_tutorial_clockbreaker',
  'avatar_estate_shoveler',
  'avatar_cheap_shield_lord',
  'avatar_mythril_smith',
  'avatar_relic_raider',
  'avatar_judgment_blade',
  'avatar_black_revolver_extra',
  'avatar_circle_infinite_mage',
  'avatar_nano_circuit_heir',
  'avatar_youngest_sword_son',
  'avatar_northern_blade_wanderer',
  'avatar_mad_demon_returnee',
  'avatar_login_fist_wanderer',
  'avatar_peerless_spear_dad',
  'avatar_ki_gauntlet_breaker',
  'avatar_sword_sense_adept',
  'avatar_myst_bead_warlock',
  'avatar_returning_constable',
  'avatar_golden_wish_princess',
  'avatar_death_route_duchess',
  'avatar_ivory_scepter_empress',
  'avatar_obsidian_throne_lady',
  'avatar_scarlet_crop_lady',
  'avatar_oak_oath_bride',
  'avatar_broken_crown_empress',
  'avatar_villain_mother_regent',
  'avatar_cat_eared_mage',
  'avatar_ledger_merchant',
  'avatar_campus_mercenary',
  'avatar_ring_striker',
  'avatar_viral_street_fighter',
  'avatar_dual_look_brawler',
  'avatar_quiet_campus_striker',
  'avatar_wind_jersey_rider',
  'avatar_lightning_cat_contractor',
  'avatar_borrowed_power_brawler',
  'avatar_chitin_marshal',
  'avatar_noble_blood_lord',
  'avatar_monster_arm_survivor',
] as const

describe('avatarComposition', () => {
  it('exposes the whole-character catalog contract including wave-1 and limited-time claims', () => {
    expect(AVATAR_CHARACTER_META).toHaveLength(80)
    expect(AVATAR_CHARACTER_META.map((character) => character.id)).toEqual([
      ...LIMITED_TIME_IDS,
      ...STARTER_IDS,
      ...LEGACY_PREMIUM_IDS,
      ...WAVE1_IDS,
      ...EMBER_CROWN_IDS,
      ...WHITE_COAT_INCARNATION_IDS,
      ...BLACK_COAT_INCARNATION_IDS,
      ...SCARLET_CAPE_HEIR_IDS,
      ...PINKBURST_MAGE_IDS,
      ...SHAWL_SPIRIT_MEDIUM_IDS,
      ...WHITE_BLOOM_SAINTESS_IDS,
      ...POPULAR_WAVE_IDS,
      ...STONEHAMMER_BARBARIAN_IDS,
      ...VIOLET_BERET_MAGE_IDS,
      ...ASHBLOOM_MERCENARY_IDS,
      ...CRIMSON_TIP_MAID_IDS,
      ...HOLLOW_GAZE_BOXER_IDS,
      ...SILENT_PLUM_BLADE_IDS,
    ])
    expect(DEFAULT_AVATAR_ID).toBe('avatar_default_female')
    expect(AVATAR_CHARACTER_META.filter((character) => character.starter)).toHaveLength(2)
    expect(AVATAR_CHARACTER_META.filter((character) => character.limitedTime)).toHaveLength(2)
    expect(AVATAR_CHARACTER_META.filter((character) => character.price > 0)).toHaveLength(76)
    expect(AVATAR_CHARACTER_META.filter((character) => character.rarity === 'epic')).toHaveLength(21)
    expect(
      AVATAR_CHARACTER_META.filter((character) => character.rarity === 'legendary'),
    ).toHaveLength(10)
    expect(POPULAR_WAVE_IDS).toHaveLength(49)
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
    expect(getAvatarCharacterMeta('avatar_ember_crown')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
      description: 'Fiery orange ponytail, gold-collar cape, and a held fireball.',
    })
    expect(getAvatarCharacterMeta('avatar_white_coat_incarnation')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
      description: 'Long white coat, messy black hair, and compact star-spark aura.',
    })
    expect(getAvatarCharacterMeta('avatar_black_coat_incarnation')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
      description: 'Long black coat, high collar, and compact storm-wind aura.',
    })
    expect(getAvatarCharacterMeta('avatar_scarlet_cape_heir')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Platinum hair, red-lined academy cape, and a gold-hilt dagger.',
    })
    expect(getAvatarCharacterMeta('avatar_pinkburst_mage')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
      description: 'Messy coral-pink hair, red academy blazer, and a gold explosion orb.',
    })
    expect(getAvatarCharacterMeta('avatar_shawl_spirit_medium')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Beige shawl, amber eyes, and tiny elemental spirit familiars.',
    })
    expect(getAvatarCharacterMeta('avatar_white_bloom_saintess')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'White hair, uncovered crimson eyes, and a gold holy staff.',
    })
    expect(getAvatarCharacterMeta('avatar_ice_huntress_knight')).toMatchObject({
      price: 4000,
      rarity: 'rare',
      starter: false,
      description: 'Silver-blonde ponytail, hunter armor, and a crystalline ice greatsword.',
    })
    expect(getAvatarCharacterMeta('avatar_monster_arm_survivor')).toMatchObject({
      price: 7000,
      rarity: 'epic',
      starter: false,
      description: 'Messy black hair, grey hoodie, and one monstrous green claw arm.',
    })
    expect(getAvatarCharacterMeta('avatar_violet_beret_mage')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Blonde braid, violet beret with a white feather, and an ornate gold staff.',
    })
    expect(getAvatarCharacterMeta('avatar_stonehammer_barbarian')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Spiky brown hair, stone warhammer, and a horned-helmet belt buckle.',
    })
    expect(getAvatarCharacterMeta('avatar_ashbloom_mercenary')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Ash-blonde hair, maroon coat with cream pauldrons, and a white bloom sword.',
    })
    expect(getAvatarCharacterMeta('avatar_crimson_tip_maid')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Silver hair with crimson tips, black maid dress, and a silver needle.',
    })
    expect(getAvatarCharacterMeta('avatar_hollow_gaze_boxer')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Pale skin, hollow black eyes, and red-accent boxing gloves.',
    })
    expect(getAvatarCharacterMeta('avatar_silent_plum_blade')).toMatchObject({
      price: 10000,
      rarity: 'legendary',
      starter: false,
      description: 'Long violet hair, red sash, plum crest, and a silver jian.',
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
    expect(getAvatarCharacterMeta('avatar_explorer_a')).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: false,
      limitedTime: true,
      description: 'First steps on the journey. Limited-time free claim.',
    })
    expect(getAvatarCharacterMeta('avatar_explorer_b')).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: false,
      limitedTime: true,
      description: 'First steps on the journey. Limited-time free claim.',
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
    expect(describeAvatar('avatar_ember_crown')).toBe('Ember Crown')
    expect(describeAvatar('avatar_white_coat_incarnation')).toBe('White Coat Incarnation')
    expect(describeAvatar('avatar_black_coat_incarnation')).toBe('Black Coat Incarnation')
    expect(describeAvatar('avatar_scarlet_cape_heir')).toBe('Scarlet Cape Heir')
    expect(describeAvatar('avatar_pinkburst_mage')).toBe('Pinkburst Mage')
    expect(describeAvatar('avatar_shawl_spirit_medium')).toBe('Shawl Spirit Medium')
    expect(describeAvatar('avatar_white_bloom_saintess')).toBe('White Bloom Saintess')
    expect(describeAvatar('avatar_ice_huntress_knight')).toBe('Ice Huntress Knight')
    expect(describeAvatar('avatar_monster_arm_survivor')).toBe('Monster Arm Survivor')
    expect(describeAvatar('avatar_violet_beret_mage')).toBe('Violet Beret Mage')
    expect(describeAvatar('avatar_stonehammer_barbarian')).toBe('Stonehammer Barbarian')
    expect(describeAvatar('avatar_ashbloom_mercenary')).toBe('Ashbloom Mercenary')
    expect(describeAvatar('avatar_crimson_tip_maid')).toBe('Crimson-Tip Maid')
    expect(describeAvatar('avatar_hollow_gaze_boxer')).toBe('Hollow Gaze Boxer')
    expect(describeAvatar('avatar_silent_plum_blade')).toBe('Silent Plum Blade')
    expect(describeAvatar('not-a-character')).toBe(describeAvatar(DEFAULT_AVATAR_ID))
  })

  it('lists starter ids as the two free defaults', () => {
    expect(starterAvatarIds().sort()).toEqual(['avatar_default_female', 'avatar_default_male'])
  })

  it('lists limited-time claim ids separately from starters', () => {
    expect(limitedTimeAvatarIds().sort()).toEqual([
      'avatar_explorer_a',
      'avatar_explorer_b',
    ])
  })

  it('sorts shop items by price with limited-time free claims first', () => {
    const sorted = [
      { id: 'avatar_shadow_hunter', price: 4000 },
      { id: 'avatar_default_female', price: 0 },
      { id: 'avatar_explorer_a', price: 0, limitedTime: true },
      { id: 'avatar_ice_sovereign', price: 7000 },
      { id: 'avatar_explorer_b', price: 0, limitedTime: true },
    ].sort(compareShopItemsByPrice)
    expect(sorted.map((row) => row.id)).toEqual([
      'avatar_explorer_a',
      'avatar_explorer_b',
      'avatar_default_female',
      'avatar_shadow_hunter',
      'avatar_ice_sovereign',
    ])
  })

  it('resolves asset URLs under the Style A base path', () => {
    expect(avatarAssetUrl('avatar_default_female')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/default-female\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_shadow_hunter')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/shadow-hunter\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_ice_sovereign')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/ice-sovereign\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_explorer_a')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/explorer-a\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_ember_crown')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/ember-crown\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_white_coat_incarnation')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/white-coat-incarnation\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_black_coat_incarnation')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/black-coat-incarnation\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_scarlet_cape_heir')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/scarlet-cape-heir\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_pinkburst_mage')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/pinkburst-mage\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_shawl_spirit_medium')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/shawl-spirit-medium\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_white_bloom_saintess')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/white-bloom-saintess\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_ice_huntress_knight')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/ice-huntress-knight\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_monster_arm_survivor')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/monster-arm-survivor\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_violet_beret_mage')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/violet-beret-mage\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_stonehammer_barbarian')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/stonehammer-barbarian\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_ashbloom_mercenary')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/ashbloom-mercenary\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_crimson_tip_maid')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/crimson-tip-maid\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_hollow_gaze_boxer')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/hollow-gaze-boxer\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('avatar_silent_plum_blade')).toMatch(
      new RegExp(`^${STYLE_A_BASE}/silent-plum-blade\\.png\\?v=\\d+$`),
    )
    expect(avatarAssetUrl('not-a-character')).toBe(avatarAssetUrl(DEFAULT_AVATAR_ID))
  })
})
