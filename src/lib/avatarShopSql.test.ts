import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_CHARACTER_META } from './avatarComposition'
import { AVATAR_STAGE_META } from './avatarStages'

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260718110000_avatar_shop_economy.sql'),
  'utf8',
)

const wholeCharacterMigrationPath = path.resolve(
  'supabase/migrations/20260718140000_whole_character_avatar_shop.sql',
)
const wave1MigrationPath = path.resolve('supabase/migrations/20260719100000_avatar_wave1_shop.sql')
const limitedTimeMigrationPath = path.resolve(
  'supabase/migrations/20260720100729_avatar_limited_time_newbies.sql',
)
const skyMeadowLimitedTimeMigrationPath = path.resolve(
  'supabase/migrations/20260720174500_avatar_limited_time_sky_meadow.sql',
)
const explorerReplaceMigrationPath = path.resolve(
  'supabase/migrations/20260811041103_fix_free_claim_explorers.sql',
)
const freeClaimExplorersMigrationPath = path.resolve(
  'supabase/migrations/20260811041103_fix_free_claim_explorers.sql',
)
const emberCrownMigrationPath = path.resolve(
  'supabase/migrations/20260813083244_avatar_ember_crown_shop.sql',
)
const whiteCoatIncarnationMigrationPath = path.resolve(
  'supabase/migrations/20260814031900_avatar_white_coat_incarnation_shop.sql',
)
const blackCoatIncarnationMigrationPath = path.resolve(
  'supabase/migrations/20260814032000_avatar_black_coat_incarnation_shop.sql',
)
const scarletCapeHeirMigrationPath = path.resolve(
  'supabase/migrations/20260814033000_avatar_scarlet_cape_heir_shop.sql',
)
const pinkburstMageMigrationPath = path.resolve(
  'supabase/migrations/20260814035000_avatar_pinkburst_mage_shop.sql',
)
const shawlSpiritMediumMigrationPath = path.resolve(
  'supabase/migrations/20260814036000_avatar_shawl_spirit_medium_shop.sql',
)
const whiteBloomSaintessMigrationPath = path.resolve(
  'supabase/migrations/20260814038000_avatar_white_bloom_saintess_shop.sql',
)
const popularWave50MigrationPath = path.resolve(
  'supabase/migrations/20260814080000_avatar_popular_wave50_shop.sql',
)
const violetBeretMageMigrationPath = path.resolve(
  'supabase/migrations/20260903214000_avatar_violet_beret_mage_shop.sql',
)
const stonehammerBarbarianMigrationPath = path.resolve(
  'supabase/migrations/20260903164000_avatar_stonehammer_barbarian_shop.sql',
)
const ashbloomMercenaryMigrationPath = path.resolve(
  'supabase/migrations/20260903215000_avatar_ashbloom_mercenary_shop.sql',
)
const crimsonTipMaidMigrationPath = path.resolve(
  'supabase/migrations/20260903220000_avatar_crimson_tip_maid_shop.sql',
)
const hollowGazeBoxerMigrationPath = path.resolve(
  'supabase/migrations/20260903230000_avatar_hollow_gaze_boxer_shop.sql',
)
const silentPlumBladeMigrationPath = path.resolve(
  'supabase/migrations/20260904010000_avatar_silent_plum_blade_shop.sql',
)
const stageMigrationPath = path.resolve('supabase/migrations/20260719110000_avatar_stage_shop.sql')
const hasWholeCharacterMigration = fs.existsSync(wholeCharacterMigrationPath)
const wholeCharacterMigration = hasWholeCharacterMigration
  ? fs.readFileSync(wholeCharacterMigrationPath, 'utf8')
  : ''
const wave1Migration = fs.existsSync(wave1MigrationPath)
  ? fs.readFileSync(wave1MigrationPath, 'utf8')
  : ''
const limitedTimeMigration = fs.existsSync(limitedTimeMigrationPath)
  ? fs.readFileSync(limitedTimeMigrationPath, 'utf8')
  : ''
const skyMeadowLimitedTimeMigration = fs.existsSync(skyMeadowLimitedTimeMigrationPath)
  ? fs.readFileSync(skyMeadowLimitedTimeMigrationPath, 'utf8')
  : ''
const explorerReplaceMigration = fs.existsSync(explorerReplaceMigrationPath)
  ? fs.readFileSync(explorerReplaceMigrationPath, 'utf8')
  : ''
const freeClaimExplorersMigration = fs.existsSync(freeClaimExplorersMigrationPath)
  ? fs.readFileSync(freeClaimExplorersMigrationPath, 'utf8')
  : ''
const emberCrownMigration = fs.existsSync(emberCrownMigrationPath)
  ? fs.readFileSync(emberCrownMigrationPath, 'utf8')
  : ''
const whiteCoatIncarnationMigration = fs.existsSync(whiteCoatIncarnationMigrationPath)
  ? fs.readFileSync(whiteCoatIncarnationMigrationPath, 'utf8')
  : ''
const blackCoatIncarnationMigration = fs.existsSync(blackCoatIncarnationMigrationPath)
  ? fs.readFileSync(blackCoatIncarnationMigrationPath, 'utf8')
  : ''
const scarletCapeHeirMigration = fs.existsSync(scarletCapeHeirMigrationPath)
  ? fs.readFileSync(scarletCapeHeirMigrationPath, 'utf8')
  : ''
const pinkburstMageMigration = fs.existsSync(pinkburstMageMigrationPath)
  ? fs.readFileSync(pinkburstMageMigrationPath, 'utf8')
  : ''
const shawlSpiritMediumMigration = fs.existsSync(shawlSpiritMediumMigrationPath)
  ? fs.readFileSync(shawlSpiritMediumMigrationPath, 'utf8')
  : ''
const whiteBloomSaintessMigration = fs.existsSync(whiteBloomSaintessMigrationPath)
  ? fs.readFileSync(whiteBloomSaintessMigrationPath, 'utf8')
  : ''
const popularWave50Migration = fs.existsSync(popularWave50MigrationPath)
  ? fs.readFileSync(popularWave50MigrationPath, 'utf8')
  : ''
const violetBeretMageMigration = fs.existsSync(violetBeretMageMigrationPath)
  ? fs.readFileSync(violetBeretMageMigrationPath, 'utf8')
  : ''
const stonehammerBarbarianMigration = fs.existsSync(stonehammerBarbarianMigrationPath)
  ? fs.readFileSync(stonehammerBarbarianMigrationPath, 'utf8')
  : ''
const ashbloomMercenaryMigration = fs.existsSync(ashbloomMercenaryMigrationPath)
  ? fs.readFileSync(ashbloomMercenaryMigrationPath, 'utf8')
  : ''
const crimsonTipMaidMigration = fs.existsSync(crimsonTipMaidMigrationPath)
  ? fs.readFileSync(crimsonTipMaidMigrationPath, 'utf8')
  : ''
const hollowGazeBoxerMigration = fs.existsSync(hollowGazeBoxerMigrationPath)
  ? fs.readFileSync(hollowGazeBoxerMigrationPath, 'utf8')
  : ''
const silentPlumBladeMigration = fs.existsSync(silentPlumBladeMigrationPath)
  ? fs.readFileSync(silentPlumBladeMigrationPath, 'utf8')
  : ''
const stageMigration = fs.existsSync(stageMigrationPath)
  ? fs.readFileSync(stageMigrationPath, 'utf8')
  : ''
const catalogSeedSql = `${wholeCharacterMigration}\n${wave1Migration}\n${limitedTimeMigration}\n${skyMeadowLimitedTimeMigration}\n${explorerReplaceMigration}\n${freeClaimExplorersMigration}\n${emberCrownMigration}\n${whiteCoatIncarnationMigration}\n${blackCoatIncarnationMigration}\n${scarletCapeHeirMigration}\n${pinkburstMageMigration}\n${shawlSpiritMediumMigration}\n${whiteBloomSaintessMigration}\n${popularWave50Migration}\n${stonehammerBarbarianMigration}\n${violetBeretMageMigration}\n${ashbloomMercenaryMigration}\n${crimsonTipMaidMigration}\n${hollowGazeBoxerMigration}\n${silentPlumBladeMigration}`

describe('avatar shop migration contracts', () => {
  it('makes point sources idempotent and balances non-negative', () => {
    expect(migration).toContain('unique (user_id, source_type, source_id)')
    expect(migration).toContain('balance integer not null default 0 check (balance >= 0)')
    expect(migration).toContain("raise exception 'Insufficient points'")
  })

  it('encodes win, pity-loss, and surrender reward rules on the server', () => {
    expect(migration).toContain("when p_outcome = 'won' then 10")
    expect(migration).toContain('and not coalesce(p_surrendered, false)')
    expect(migration).toContain('and p_guess_count = p_max_guesses then 3')
    expect(migration).toContain('else 0')
  })

  it('guards purchases and equips with ownership, funds, auth, and bans', () => {
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'not_authenticated')")
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'cloud_banned')")
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'already_owned')")
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'insufficient_points')")
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'purchase_conflict')")
    expect(migration).toContain("return jsonb_build_object('ok', false, 'error', 'not_owned')")
    expect(migration).toContain(
      "if not coalesce((v_points ->> 'applied')::boolean, false) then",
    )
  })

  it('keeps economy tables out of authenticated direct writes', () => {
    expect(migration).toContain(
      'revoke all on table public.user_point_balances from public, anon, authenticated',
    )
    expect(migration).toContain(
      'revoke all on table app_private.point_transactions from public, anon, authenticated',
    )
  })
})

describe.runIf(hasWholeCharacterMigration)('whole-character avatar shop migration contracts', () => {
  it('seeds every catalog character with a matching asset_key', () => {
    for (const character of AVATAR_CHARACTER_META) {
      expect(catalogSeedSql).toContain(`'${character.id}'`)
      expect(catalogSeedSql).toContain(`'${character.assetKey}'`)
    }
  })

  it('exposes equipped_avatar_id plus the equip/purchase RPCs the client calls', () => {
    expect(wholeCharacterMigration).toContain('equipped_avatar_id')
    expect(wholeCharacterMigration).toContain('function public.get_avatar_shop()')
    expect(wholeCharacterMigration).toContain('function public.purchase_shop_item(text)')
    expect(wholeCharacterMigration).toContain('function public.equip_avatar(text)')
  })

  it('adds wave-1 characters without re-running the old whitelist deactivation', () => {
    expect(wave1Migration).toContain('avatar_plum_blossom_blade')
    expect(wave1Migration).toContain('avatar_villainess_rose')
    expect(wave1Migration).not.toContain('and id not in (')
  })

  it('adds Ember Crown without re-running the old whitelist deactivation', () => {
    expect(emberCrownMigration).toContain('avatar_ember_crown')
    expect(emberCrownMigration).toContain('7000')
    expect(emberCrownMigration).toContain("'epic'")
    expect(emberCrownMigration).not.toContain('and id not in (')
  })

  it('adds White Coat Incarnation without re-running the old whitelist deactivation', () => {
    expect(whiteCoatIncarnationMigration).toContain('avatar_white_coat_incarnation')
    expect(whiteCoatIncarnationMigration).toContain('7000')
    expect(whiteCoatIncarnationMigration).toContain("'epic'")
    expect(whiteCoatIncarnationMigration).not.toContain('and id not in (')
  })

  it('adds Black Coat Incarnation without re-running the old whitelist deactivation', () => {
    expect(blackCoatIncarnationMigration).toContain('avatar_black_coat_incarnation')
    expect(blackCoatIncarnationMigration).toContain('7000')
    expect(blackCoatIncarnationMigration).toContain("'epic'")
    expect(blackCoatIncarnationMigration).not.toContain('and id not in (')
  })

  it('adds Scarlet Cape Heir without re-running the old whitelist deactivation', () => {
    expect(scarletCapeHeirMigration).toContain('avatar_scarlet_cape_heir')
    expect(scarletCapeHeirMigration).toContain('10000')
    expect(scarletCapeHeirMigration).toContain("'legendary'")
    expect(scarletCapeHeirMigration).not.toContain('and id not in (')
  })

  it('adds Pinkburst Mage without re-running the old whitelist deactivation', () => {
    expect(pinkburstMageMigration).toContain('avatar_pinkburst_mage')
    expect(pinkburstMageMigration).toContain('7000')
    expect(pinkburstMageMigration).toContain("'epic'")
    expect(pinkburstMageMigration).not.toContain('and id not in (')
  })

  it('adds Shawl Spirit Medium without re-running the old whitelist deactivation', () => {
    expect(shawlSpiritMediumMigration).toContain('avatar_shawl_spirit_medium')
    expect(shawlSpiritMediumMigration).toContain('10000')
    expect(shawlSpiritMediumMigration).toContain("'legendary'")
    expect(shawlSpiritMediumMigration).not.toContain('and id not in (')
  })

  it('adds White Bloom Saintess without re-running the old whitelist deactivation', () => {
    expect(whiteBloomSaintessMigration).toContain('avatar_white_bloom_saintess')
    expect(whiteBloomSaintessMigration).toContain('10000')
    expect(whiteBloomSaintessMigration).toContain("'legendary'")
    expect(whiteBloomSaintessMigration).not.toContain('and id not in (')
  })

  it('adds popular-wave characters without re-running the old whitelist deactivation', () => {
    expect(popularWave50Migration).toContain('avatar_ice_huntress_knight')
    expect(popularWave50Migration).toContain('avatar_monster_arm_survivor')
    expect(popularWave50Migration).toContain('7000')
    expect(popularWave50Migration).toContain("'epic'")
    expect(popularWave50Migration).not.toContain('and id not in (')
  })

  it('leaves dropped shortlist plates out of the seeded catalog', () => {
    for (const droppedId of [
      'avatar_rose_veil_saintess',
      'avatar_tan_shawl_spiritist',
      'avatar_croc_spear_hunter',
    ]) {
      expect(catalogSeedSql).not.toContain(droppedId)
      expect(AVATAR_CHARACTER_META.some((character) => character.id === droppedId)).toBe(false)
    }
  })

  it('adds Violet Beret Mage without re-running the old whitelist deactivation', () => {
    expect(violetBeretMageMigration).toContain('avatar_violet_beret_mage')
    expect(violetBeretMageMigration).toContain('10000')
    expect(violetBeretMageMigration).toContain("'legendary'")
    expect(violetBeretMageMigration).toContain('770')
    expect(violetBeretMageMigration).toContain('9770')
    expect(violetBeretMageMigration).toContain('false')
    expect(violetBeretMageMigration).not.toContain('and id not in (')
  })

  it('adds Stonehammer Barbarian without re-running the old whitelist deactivation', () => {
    expect(stonehammerBarbarianMigration).toContain('avatar_stonehammer_barbarian')
    expect(stonehammerBarbarianMigration).toContain('10000')
    expect(stonehammerBarbarianMigration).toContain("'legendary'")
    expect(stonehammerBarbarianMigration).toContain('760')
    expect(stonehammerBarbarianMigration).toContain('9760')
    expect(stonehammerBarbarianMigration).toContain('false')
    expect(stonehammerBarbarianMigration).not.toContain('and id not in (')
  })

  it('adds Ashbloom Mercenary without re-running the old whitelist deactivation', () => {
    expect(ashbloomMercenaryMigration).toContain('avatar_ashbloom_mercenary')
    expect(ashbloomMercenaryMigration).toContain('10000')
    expect(ashbloomMercenaryMigration).toContain("'legendary'")
    expect(ashbloomMercenaryMigration).toContain('780')
    expect(ashbloomMercenaryMigration).toContain('9780')
    expect(ashbloomMercenaryMigration).toContain('false')
    expect(ashbloomMercenaryMigration).not.toContain('and id not in (')
  })

  it('adds Crimson-Tip Maid without re-running the old whitelist deactivation', () => {
    expect(crimsonTipMaidMigration).toContain('avatar_crimson_tip_maid')
    expect(crimsonTipMaidMigration).toContain('10000')
    expect(crimsonTipMaidMigration).toContain("'legendary'")
    expect(crimsonTipMaidMigration).toContain('790')
    expect(crimsonTipMaidMigration).toContain('9790')
    expect(crimsonTipMaidMigration).toContain('false')
    expect(crimsonTipMaidMigration).not.toContain('and id not in (')
  })

  it('adds Hollow Gaze Boxer without re-running the old whitelist deactivation', () => {
    expect(hollowGazeBoxerMigration).toContain('avatar_hollow_gaze_boxer')
    expect(hollowGazeBoxerMigration).toContain('10000')
    expect(hollowGazeBoxerMigration).toContain("'legendary'")
    expect(hollowGazeBoxerMigration).toContain('800')
    expect(hollowGazeBoxerMigration).toContain('9800')
    expect(hollowGazeBoxerMigration).toContain('false')
    expect(hollowGazeBoxerMigration).not.toContain('and id not in (')
  })

  it('adds Silent Plum Blade without re-running the old whitelist deactivation', () => {
    expect(silentPlumBladeMigration).toContain('avatar_silent_plum_blade')
    expect(silentPlumBladeMigration).toContain('10000')
    expect(silentPlumBladeMigration).toContain("'legendary'")
    expect(silentPlumBladeMigration).toContain('810')
    expect(silentPlumBladeMigration).toContain('9810')
    expect(silentPlumBladeMigration).toContain('false')
    expect(silentPlumBladeMigration).not.toContain('and id not in (')
  })

  it('adds limited-time free claims without auto-granting all price-0 avatars', () => {
    expect(limitedTimeMigration).toContain('avatar_quest_recruit')
    expect(limitedTimeMigration).toContain('avatar_spark_apprentice')
    expect(limitedTimeMigration).toContain('order by si.price asc')
    expect(limitedTimeMigration).toContain(
      "si.id in ('avatar_default_female', 'avatar_default_male')",
    )
    expect(limitedTimeMigration).toContain("'limited_time'")
    expect(limitedTimeMigration).toContain('elsif v_item.price = 0 then')
    expect(limitedTimeMigration).not.toContain('and id not in (')
  })

  it('makes Sky Meadow a limited-time free stage without auto-grant', () => {
    expect(skyMeadowLimitedTimeMigration).toContain("id = 'stage_sky_meadow'")
    expect(skyMeadowLimitedTimeMigration).toContain('price = 0')
    expect(skyMeadowLimitedTimeMigration).toContain(
      "si.id = 'stage_blossom_courtyard'",
    )
    expect(skyMeadowLimitedTimeMigration).toContain(
      "'limited_time', si.id = 'stage_sky_meadow'",
    )
    expect(skyMeadowLimitedTimeMigration).not.toContain('and si.price = 0')
  })
})

const revokeLimitedTimeMigrationPath = path.resolve(
  'supabase/migrations/20260720175500_revoke_autoclaimed_limited_time.sql',
)
const revokeLimitedTimeMigration = fs.existsSync(revokeLimitedTimeMigrationPath)
  ? fs.readFileSync(revokeLimitedTimeMigrationPath, 'utf8')
  : ''

describe.runIf(Boolean(revokeLimitedTimeMigration))('revoke autoclaimed limited-time migration', () => {
  it('revokes limited-time entitlements and never auto-grants by price=0', () => {
    expect(revokeLimitedTimeMigration).toContain('avatar_quest_recruit')
    expect(revokeLimitedTimeMigration).toContain('avatar_spark_apprentice')
    expect(revokeLimitedTimeMigration).toContain('stage_sky_meadow')
    expect(revokeLimitedTimeMigration).toContain('delete from public.user_shop_entitlements')
    expect(revokeLimitedTimeMigration).toContain(
      "si.id in ('avatar_default_female', 'avatar_default_male')",
    )
    expect(revokeLimitedTimeMigration).toContain("si.id = 'stage_blossom_courtyard'")
    expect(revokeLimitedTimeMigration).not.toMatch(
      /item_type = 'avatar_stage'[\s\S]*and si\.price = 0/,
    )
  })
})

describe.runIf(Boolean(explorerReplaceMigration))('explorer A/B replace limited-time newbies', () => {
  it('retires Quest Recruit / Spark Apprentice and seeds Explorer A / B', () => {
    expect(explorerReplaceMigration).toContain('avatar_explorer_a')
    expect(explorerReplaceMigration).toContain('avatar_explorer_b')
    expect(explorerReplaceMigration).toContain("active = false")
    expect(explorerReplaceMigration).toContain('avatar_quest_recruit')
    expect(explorerReplaceMigration).toContain('avatar_spark_apprentice')
    expect(explorerReplaceMigration).toContain(
      "si.id in ('avatar_explorer_a', 'avatar_explorer_b')",
    )
    expect(explorerReplaceMigration).toContain(
      'First steps on the journey. Limited-time free claim.',
    )
  })
})

describe.runIf(Boolean(freeClaimExplorersMigration))('fix free-claim explorers migration', () => {
  it('seeds Explorer A/B and repairs purchase_shop_item free claims', () => {
    expect(freeClaimExplorersMigration).toContain('avatar_explorer_a')
    expect(freeClaimExplorersMigration).toContain('avatar_explorer_b')
    expect(freeClaimExplorersMigration).toContain(
      "si.id in ('avatar_explorer_a', 'avatar_explorer_b')",
    )
    expect(freeClaimExplorersMigration).toContain('function public.purchase_shop_item(text)')
    expect(freeClaimExplorersMigration).toContain('elsif v_item.price = 0 then')
    expect(freeClaimExplorersMigration).toContain(
      "'Purchase or free-claim a shop item. Price 0 grants entitlement and returns ok.'",
    )
    expect(freeClaimExplorersMigration).not.toContain(
      'elsif v_item.price = 0 or exists (',
    )
  })
})

describe.runIf(Boolean(stageMigration))('avatar stage shop migration contracts', () => {
  it('seeds every catalog stage and equips via equipped_stage_id', () => {
    for (const stage of AVATAR_STAGE_META) {
      expect(stageMigration).toContain(`'${stage.id}'`)
      expect(stageMigration).toContain(`'${stage.assetKey}'`)
    }
    expect(stageMigration).toContain('equipped_stage_id')
    expect(stageMigration).toContain("'avatar_stage'")
    expect(stageMigration).toContain('function public.equip_stage(text)')
    expect(stageMigration).toContain("'stages'")
  })
})

const awakeningMigrationPath = path.resolve(
  'supabase/migrations/20260719213957_avatar_awakenings.sql',
)
const awakeningMigration = fs.existsSync(awakeningMigrationPath)
  ? fs.readFileSync(awakeningMigrationPath, 'utf8')
  : ''

describe.runIf(Boolean(awakeningMigration))('avatar awakenings migration contracts', () => {
  it('adds avatar_awakening catalog shape and user_avatar_awakenings', () => {
    expect(awakeningMigration).toContain("'avatar_awakening'")
    expect(awakeningMigration).toContain('parent_item_id')
    expect(awakeningMigration).toContain('awakening_tier')
    expect(awakeningMigration).toContain('create table if not exists public.user_avatar_awakenings')
    expect(awakeningMigration).toContain('check (level in (1, 2))')
  })

  it('gates sequential purchases and returns awakening levels from shop/account', () => {
    expect(awakeningMigration).toContain("'parent_not_owned'")
    expect(awakeningMigration).toContain("'requires_awakening_i'")
    expect(awakeningMigration).toContain('awakening_level')
    expect(awakeningMigration).toContain('equipped_awakening_level')
    expect(awakeningMigration).toContain("'awakenings'")
    expect(awakeningMigration).toContain('avatar_awakenings')
  })

  it('seeds awakenings for premium Style A characters', () => {
    expect(awakeningMigration).toContain("'awaken_' || si.id || '_1'")
    expect(awakeningMigration).toContain("'awaken_' || si.id || '_2'")
    expect(awakeningMigration).toContain('and si.price > 0')
  })
})

const singleAwakeningMigrationPath = path.resolve(
  'supabase/migrations/20260719140000_single_avatar_awakening.sql',
)
const singleAwakeningMigration = fs.existsSync(singleAwakeningMigrationPath)
  ? fs.readFileSync(singleAwakeningMigrationPath, 'utf8')
  : ''

describe.runIf(Boolean(singleAwakeningMigration))('single awakening collapse migration', () => {
  it('deactivates tier-2 rows and clamps owned levels to 1', () => {
    expect(singleAwakeningMigration).toContain('awakening_tier = 2')
    expect(singleAwakeningMigration).toContain('active = false')
    expect(singleAwakeningMigration).toContain('awakening_level = 1')
    expect(singleAwakeningMigration).toContain("name = 'Awakening'")
  })
})

describe('client catalog readiness for the migration handoff', () => {
  it('has a non-empty whole-character catalog for the migration to seed', () => {
    expect(AVATAR_CHARACTER_META.length).toBeGreaterThan(0)
    expect(new Set(AVATAR_CHARACTER_META.map((character) => character.id)).size).toBe(
      AVATAR_CHARACTER_META.length,
    )
  })
})
