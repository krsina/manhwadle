import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GACHA_HARD_PITY, GACHA_RATES, GACHA_SOFT_PITY } from './gacha'
import { GACHA_PULL_COST, GACHA_WEEKLY_PRICES } from './gachaWeekly'

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260904080000_gacha_shop.sql'),
  'utf8',
)
const ratesMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20260904100000_gacha_rates.sql'),
  'utf8',
)

describe('gacha shop migration contract', () => {
  it('exposes banner RPCs, pity, pull cost, and gacha-only catalog purchases', () => {
    expect(migration).toContain('function public.get_gacha_state()')
    expect(migration).toContain('function public.pull_gacha()')
    expect(migration).toContain('function public.buy_gacha_weekly(p_item_id text)')
    expect(migration).toContain('function public.exchange_gacha_copies(p_source_id text)')
    expect(migration).toContain("'gacha_pull'")
    expect(migration).toContain("'gacha_weekly'")
    expect(migration).toContain("'gacha_only'")
    expect(migration).toContain("if v_item.item_type = 'avatar' then")
    expect(migration).not.toContain('and v_item.price > 0')
    expect(migration).toContain('Never fall up in rarity')
    expect(migration).toContain("'rate_limited'")
    expect(migration).toContain("consume_rpc_rate_limit(v_uid, 'pull_gacha', 20, 60)")
    expect(migration).toContain("consume_rpc_rate_limit(v_uid, 'buy_gacha_weekly', 10, 60)")
    expect(migration).toContain("consume_rpc_rate_limit(v_uid, 'exchange_gacha_copies', 20, 60)")
    expect(migration).toContain('Invalid gacha item')
    expect(migration).toContain('revoke all on function public.pull_gacha() from public, anon')
    expect(migration).toContain(
      'revoke all on function app_private.grant_gacha_copy(uuid, text) from public, anon, authenticated',
    )
    expect(migration).toContain(`-${GACHA_PULL_COST}`)
    expect(ratesMigration).toContain('v_rand < 0.45')
    expect(ratesMigration).toContain('v_rand < 0.79')
    expect(ratesMigration).toContain('v_rand < 0.99')
    expect(GACHA_RATES).toMatchObject({ common: 0.45, rare: 0.34, epic: 0.2, legendary: 0.01 })
    expect(migration).toContain(`pulls_since_rare_plus >= ${GACHA_SOFT_PITY}`)
    expect(migration).toContain(`v_next % ${GACHA_HARD_PITY} = 0`)
    expect(migration).toContain(`when 'common' then ${GACHA_WEEKLY_PRICES.common}`)
    expect(migration).toContain(`when 'rare' then ${GACHA_WEEKLY_PRICES.rare}`)
    expect(migration).toContain(`when 'epic' then ${GACHA_WEEKLY_PRICES.epic}`)
    expect(migration).toContain(`when 'legendary' then ${GACHA_WEEKLY_PRICES.legendary}`)
    expect(migration).toContain('grant execute on function public.pull_gacha() to authenticated')
    expect(migration).toContain('grant execute on function public.get_gacha_state() to anon')
  })
})
