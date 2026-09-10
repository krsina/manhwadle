import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs
  .readFileSync(
    path.resolve(
      'supabase/migrations/20260910071750_rebalance_new_user_achievement_stacks.sql',
    ),
    'utf8',
  )
  .replace(/\r\n/g, '\n')

describe('new-user achievement rebalance migration', () => {
  it('requires a meaningful no-hint run for Hint Denied', () => {
    expect(migration).toMatch(
      /coalesce\(p_hints_used, 0\) = 0\s+and p_guess_count > 1\s+and not coalesce\(p_hard_mode, false\)/,
    )
    expect(migration).toContain(
      "try_award_secret(p_user_id, 'secret_hint_denied')",
    )
  })

  it('moves Clean Sweep away from the first full-clear day', () => {
    expect(migration).toMatch(
      /threshold = 4,[\s\S]*where id = 'all_mode_streak_1'/,
    )
  })

  it('preserves first-guess Perfect Panel awards and restricted grants', () => {
    expect(migration).toContain(
      'p_guess_count = 1 and coalesce(p_hints_used, 0) = 0',
    )
    expect(migration).toContain(
      'from public, anon, authenticated',
    )
    expect(migration).toContain('to postgres, service_role')
  })
})
