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
  'supabase/migrations/20260722120000_avatar_explorer_ab_replace_newbies.sql',
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
const stageMigration = fs.existsSync(stageMigrationPath)
  ? fs.readFileSync(stageMigrationPath, 'utf8')
  : ''
const catalogSeedSql = `${wholeCharacterMigration}\n${wave1Migration}\n${limitedTimeMigration}\n${skyMeadowLimitedTimeMigration}\n${explorerReplaceMigration}`

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
