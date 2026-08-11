import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readSql(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), 'utf8').replace(/\r\n/g, '\n')
}

const migration = readSql(
  'supabase/migrations/20260811081637_group_multiplayer_backend.sql',
)
const hardeningMigration = readSql(
  'supabase/migrations/20260811142214_multiplayer_abuse_hardening.sql',
)
const hardeningFollowupMigration = readSql(
  'supabase/migrations/20260811143537_multiplayer_abuse_hardening_followup.sql',
)
const collaborativePoolsMigration = readSql(
  'supabase/migrations/20260811144836_collaborative_versus_pools.sql',
)
const schedulerMigration = readSql(
  'supabase/migrations/20260811160352_enable_multiplayer_cron.sql',
)
const singleContributorMigration = readSql(
  'supabase/migrations/20260811185816_collaborative_pool_single_contributor.sql',
)
const fullCatalogCapMigration = readSql(
  'supabase/migrations/20260811194713_saved_lists_full_catalog_cap.sql',
)

describe('group multiplayer backend migration contracts', () => {
  it('keeps every multiplayer table private and restores no versus objects', () => {
    for (const table of [
      'multiplayer_rooms',
      'multiplayer_members',
      'multiplayer_active_occupancy',
      'multiplayer_rounds',
      'multiplayer_attempts',
      'multiplayer_idempotency',
    ]) {
      expect(migration).toContain(`create table if not exists app_private.${table}`)
      expect(migration).toContain(
        `alter table app_private.${table} enable row level security`,
      )
      expect(migration).toContain(
        `revoke all on table app_private.${table} from public, anon, authenticated`,
      )
    }
    expect(migration).not.toMatch(/\bversus_/)
  })

  it('supports selected capacity and three rounds per mode in fixed order', () => {
    expect(migration).toContain('max_players smallint not null check (max_players between 2 and 8)')
    expect(migration).toContain('rounds_per_mode smallint not null default 3 check (rounds_per_mode = 3)')
    expect(migration).toContain(
      "unnest(array['summary', 'character', 'cover', 'heardle']) with ordinality",
    )
    expect(migration).toContain('foreach v_mode in array v_room.selected_modes loop')
    expect(migration).toContain('for v_mode_round in 1..3 loop')
    expect(migration).toContain('unique (room_id, mode, mode_round)')
  })

  it('requires a username and leases one unique active-room seat per user', () => {
    expect(migration).toContain("nullif(btrim(profile.username), '') is not null")
    expect(migration).toContain("'username_required'")
    expect(migration).toContain(
      'create table if not exists app_private.multiplayer_active_occupancy',
    )
    expect(migration).toContain(
      'user_id uuid primary key references auth.users (id) on delete cascade',
    )
    expect(migration).toContain('seat smallint not null check (seat between 1 and 8)')
    expect(migration).toContain('unique (room_id, seat)')
    expect(migration).toContain("hashtext('multiplayer_active_room')")
    expect(migration).toContain("'active_room_exists'")
  })

  it('implements the locked phase model and timing', () => {
    for (const status of [
      "'lobby'::text",
      "'countdown'::text",
      "'active'::text",
      "'intermission'::text",
      "'completed'::text",
      "'cancelled'::text",
      "'expired'::text",
    ]) {
      expect(migration).toContain(status)
    }
    expect(migration).toContain("phase_ends_at = v_now + interval '3 seconds'")
    expect(migration).toContain("p_now + interval '180 seconds'")
    expect(migration).toContain("phase_ends_at = p_now + interval '7 seconds'")
  })

  it('uses UUID rounds and emits the full frontend snapshot', () => {
    expect(migration).toContain('id uuid primary key default gen_random_uuid()')
    expect(migration).toContain("'mode_round', r.mode_round")
    expect(migration).toContain("'room', jsonb_build_object(")
    expect(migration).toContain("'members', v_members")
    expect(migration).toContain("'rounds', v_rounds")
    expect(migration).toContain("'attempts', v_attempts")
    expect(migration).toContain("'server_now', now()")
    expect(migration).toContain("'version', v_room.version")
    expect(migration).toContain("'phase_ends_at', v_room.phase_ends_at")
    expect(migration).toContain("'avatar_id', ranked.avatar_id")
    expect(migration).toContain("'stage_id', ranked.stage_id")
    expect(migration).not.toContain('equipped_awakening_level')
    expect(migration).not.toContain("'awakening_level', ranked.awakening_level")
    expect(migration).toContain('uap.equipped_stage_id as stage_id')
  })

  it('matches exact public RPC names and parameter contracts', () => {
    expect(migration).toContain(
      'function public.multiplayer_create_room(\n  p_selected_modes text[],\n  p_max_players integer,\n  p_idempotency_key text',
    )
    expect(migration).toContain(
      'function public.multiplayer_join_room(\n  p_code text,\n  p_idempotency_key text',
    )
    expect(migration).toContain(
      'function public.multiplayer_update_settings(\n  p_room_id uuid,\n  p_selected_modes text[],\n  p_max_players integer,\n  p_idempotency_key text',
    )
    expect(migration).toContain('function public.multiplayer_start_match(')
    expect(migration).not.toContain('function public.multiplayer_start_room(')
    expect(migration).toContain(
      'function public.multiplayer_submit_guess(\n  p_room_id uuid,\n  p_round_id uuid,\n  p_guess_id integer,',
    )
    expect(migration).toContain(
      'function public.multiplayer_surrender(\n  p_room_id uuid,\n  p_round_id uuid,',
    )
  })

  it('normalizes every clue mode and hides active answers and fingerprints', () => {
    expect(migration).toContain("if p_mode in ('summary', 'cover') then")
    expect(migration).toContain("elsif p_mode = 'character'")
    expect(migration).toContain("elsif p_mode = 'heardle'")
    expect(migration).toContain(
      'app_private.multiplayer_normalize_clue(v_mode, p.meta) is not null',
    )
    expect(migration).toContain(
      "'answer_id', case when r.status in ('completed', 'cancelled') then r.answer_id else null end",
    )
    expect(migration).toContain(
      "'answer_label', case when r.status in ('completed', 'cancelled') then r.answer_label else null end",
    )
    expect(migration).not.toMatch(/'answer_fingerprint',\s*r\.answer_fingerprint/)
  })

  it('exposes completed feedback to all while active feedback stays viewer-only', () => {
    for (const key of ['genres', 'year', 'status', 'publisher', 'tags']) {
      expect(migration).toContain(`'${key}', jsonb_build_object(`)
    }
    expect(migration).toContain("'guess_id', p_guess_id")
    expect(migration).toContain("'is_correct', p_correct")
    expect(migration).toContain(
      "when a.user_id = p_viewer_id or r.status in ('completed', 'cancelled')\n        then to_jsonb(a.guess_ids)",
    )
    expect(migration).toContain(
      "when a.user_id = p_viewer_id or r.status in ('completed', 'cancelled')\n        then a.feedback",
    )
  })

  it('scores server-side and gives tied scores a shared rank without economy', () => {
    expect(migration).toContain(
      'v_score := round(1000 * v_guess_factor * v_speed_factor)',
    )
    expect(migration).toContain('rank() over (order by m.total_score desc)')
    expect(migration).not.toContain('dense_rank() over')
    expect(migration).not.toMatch(/point_transactions|user_point_balances|award|economy/i)
  })

  it('treats host readiness and leave behavior according to phase', () => {
    expect(migration).toContain(
      'insert into app_private.multiplayer_members (room_id, user_id, seat, is_ready)\n  values (v_room_id, v_uid, 1, false)',
    )
    expect(migration).toContain(
      'set is_ready = false where room_id = p_room_id and is_active',
    )
    expect(migration).toContain('set is_ready = coalesce(p_ready, false)')
    expect(migration).toContain(
      "if v_room.status = 'lobby' and v_room.host_user_id = v_uid then",
    )
    expect(migration).toContain(
      "if v_room.status in ('completed', 'cancelled', 'expired') then",
    )
    expect(migration).toContain(
      "set is_active = false, is_ready = false, left_at = v_now",
    )
  })

  it('avoids daily and match answer reuse', () => {
    expect(migration).toContain(
      'perform public.ensure_daily_puzzles(public.current_utc_date_key())',
    )
    expect(migration).toContain(
      'where used.room_id = p_room_id and used.answer_id = p.manhwa_id',
    )
    expect(migration).toContain(
      'daily.date_key = public.current_utc_date_key()',
    )
    expect(migration).toContain('daily.answer_id = p.manhwa_id')
  })

  it('checks membership before state advancement', () => {
    expect(migration).toMatch(
      /function public\.multiplayer_get_state[\s\S]*?if not exists \([\s\S]*?multiplayer_members[\s\S]*?return jsonb_build_object\('ok', false, 'error', 'room_not_found'\);[\s\S]*?perform app_private\.multiplayer_advance_locked/,
    )
  })

  it('retains abuse controls, private broadcast authorization, and sweeping', () => {
    expect(migration).toContain('app_private.is_cloud_banned(v_uid)')
    expect(migration).toContain('app_private.consume_rpc_rate_limit')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('create policy multiplayer_members_receive_broadcast')
    expect(migration).toContain("'state_invalidated'")
    expect(migration).toContain("created_at < v_now - interval '24 hours'")
    expect(migration).toContain("completed_at < v_now - interval '30 days'")
    expect(migration).toContain(
      'delete from app_private.multiplayer_active_occupancy',
    )
    expect(migration).toContain(
      "room.status in ('completed', 'cancelled', 'expired')",
    )
    expect(migration).toContain(
      "to_regprocedure('cron.schedule(text,text,text)')",
    )
    expect(migration).toContain("'multiplayer-tick-minute'")
    expect(migration).toContain("'* * * * *'")
    expect(migration).toContain(
      'revoke all on function public.multiplayer_tick(integer) from public, anon, authenticated',
    )
  })
})

describe('multiplayer scheduler migration contracts', () => {
  it('installs pg_cron and idempotently replaces the named minute job', () => {
    expect(schedulerMigration).toContain('create extension if not exists pg_cron')
    expect(schedulerMigration).toContain("where jobname = 'multiplayer-tick-minute'")
    expect(schedulerMigration).toContain('perform cron.unschedule(v_job_id)')
    expect(schedulerMigration).toContain("'* * * * *'")
    expect(schedulerMigration).toContain("'select public.multiplayer_tick(500);'")
  })
})

describe('multiplayer abuse hardening migration contracts', () => {
  it('keeps abuse state private and moves RPC implementations out of public', () => {
    expect(hardeningMigration).toContain(
      'create table if not exists app_private.multiplayer_abuse_state',
    )
    expect(hardeningMigration).toContain(
      'alter table app_private.multiplayer_abuse_state enable row level security',
    )
    expect(hardeningMigration).toContain(
      'revoke all on table app_private.multiplayer_abuse_state\n  from public, anon, authenticated',
    )
    expect(hardeningMigration).toContain(
      'alter function public.multiplayer_create_room(text[], integer, text)\n  set schema app_private',
    )
    expect(hardeningMigration).toContain(
      'revoke all on function app_private.multiplayer_submit_guess_impl',
    )
  })

  it('persists balanced burst, daily, and read limits in public wrappers', () => {
    expect(hardeningMigration).toContain(
      "v_uid, 'multiplayer_create_room_10m', 6, 600",
    )
    expect(hardeningMigration).toContain(
      "v_uid, 'multiplayer_create_room_24h', 100, 86400",
    )
    expect(hardeningMigration).toContain(
      "v_uid, 'multiplayer_start_match_10m', 6, 600",
    )
    expect(hardeningMigration).toContain(
      "v_uid, 'multiplayer_get_state', 60, 60",
    )
    expect(hardeningMigration).toContain(
      "exception when sqlstate 'P0001' then",
    )
    expect(hardeningMigration).toContain(
      "'create_quota_exceeded'",
    )
  })

  it('escalates repeated first-round abandonment without punishing completed play', () => {
    expect(hardeningMigration).toContain(
      'create trigger multiplayer_early_abandon_guard',
    )
    expect(hardeningMigration).toContain(
      "round.round_index = 0\n         and round.status = 'completed'",
    )
    expect(hardeningMigration).toContain(
      "v_state.window_started_at <= p_now - interval '30 minutes'",
    )
    expect(hardeningMigration).toContain(
      "then interval '15 minutes' else interval '1 hour' end",
    )
    expect(hardeningMigration).toContain("'abuse_cooldown'")
  })

  it('uses high-entropy eight-character codes with legacy compatibility', () => {
    expect(hardeningMigration).toContain(
      "check (code ~ '^[A-Z2-9]{6}$' or code ~ '^[A-Z2-9]{8}$')",
    )
    expect(hardeningMigration).toContain(
      "v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'",
    )
    expect(hardeningMigration).toContain('extensions.gen_random_bytes(8)')
    expect(hardeningMigration).toContain(
      "(get_byte(v_bytes, v_index) % 32) + 1",
    )
  })

  it('bounds terminal, lobby, and idempotency storage', () => {
    expect(hardeningMigration).toContain("interval '15 minutes'")
    expect(hardeningMigration).toContain("interval '5 minutes'")
    expect(hardeningMigration).toContain("interval '2 hours'")
    expect(hardeningMigration).toContain(
      "created_at < v_now - interval '1 hour'",
    )
    expect(hardeningMigration).toContain('offset 127')
    expect(hardeningMigration).toContain('limit 5000')
    expect(hardeningMigration).toContain(
      'create index if not exists multiplayer_rooms_terminal_expiry_idx',
    )
    expect(hardeningMigration).toContain(
      'create index if not exists multiplayer_idempotency_user_created_idx',
    )
  })

  it('blocks inactive live polling and suppresses no-op ready broadcasts', () => {
    expect(hardeningMigration).toContain(
      "if not v_active and v_status not in ('completed', 'cancelled', 'expired') then",
    )
    expect(hardeningMigration).toContain("'member_inactive'")
    expect(hardeningMigration).toContain(
      "and member.is_ready = coalesce(p_ready, false)",
    )
    expect(hardeningMigration).toContain(
      'return app_private.multiplayer_idempotency_put(',
    )
  })

  it('pins request clocks and settles elapsed rounds before leave penalties', () => {
    expect(hardeningFollowupMigration).toContain(
      "perform set_config('TimeZone', 'UTC', true)",
    )
    expect(hardeningFollowupMigration).toMatch(
      /function app_private\.consume_rpc_rate_limit[\s\S]*?v_now timestamptz := now\(\)/,
    )
    expect(hardeningFollowupMigration).toMatch(
      /function public\.multiplayer_leave_room[\s\S]*?multiplayer_members[\s\S]*?for update;[\s\S]*?multiplayer_advance_locked\(p_room_id, now\(\)\)[\s\S]*?multiplayer_leave_room_impl/,
    )
    expect(hardeningFollowupMigration).toMatch(
      /function public\.multiplayer_tick[\s\S]*?v_now timestamptz := now\(\)/,
    )
  })
})

describe('collaborative Versus pools migration contracts', () => {
  it('keeps saved lists private and owner-scoped', () => {
    for (const table of [
      'user_saved_lists',
      'user_saved_list_entries',
      'multiplayer_list_contributions',
      'multiplayer_list_contribution_entries',
    ]) {
      expect(collaborativePoolsMigration).toContain(
        `alter table app_private.${table} enable row level security`,
      )
      expect(collaborativePoolsMigration).toContain(
        `revoke all on table app_private.${table}`,
      )
    }
    expect(collaborativePoolsMigration).toContain(
      "v_uid := app_private.multiplayer_require_actor('saved_list_create', 10)",
    )
    expect(collaborativePoolsMigration).toContain(
      'where id = p_list_id and owner_user_id = v_uid',
    )
    expect(collaborativePoolsMigration).not.toMatch(
      /function public\.saved_list_[^(]+\([^)]*owner_user_id/i,
    )
  })

  it('bounds names, list counts, entries, catalog ids, and rate windows', () => {
    expect(collaborativePoolsMigration).toContain(
      'char_length(name) between 1 and 40',
    )
    expect(collaborativePoolsMigration).toContain(
      'cardinality(p_manhwa_ids) not between 3 and 100',
    )
    expect(collaborativePoolsMigration).toContain(
      ") >= 10 then\n      return jsonb_build_object('ok', false, 'error', 'list_limit_reached')",
    )
    expect(collaborativePoolsMigration).toContain(
      "'list_title_not_in_catalog'",
    )
    expect(collaborativePoolsMigration).toContain(
      "v_uid, 'saved_list_create_10m', 10, 600",
    )
    expect(collaborativePoolsMigration).toContain(
      'app_private.multiplayer_idempotency_put',
    )
    expect(hardeningFollowupMigration).toContain('offset 127')
  })

  it('snapshots one owned list per member and resets readiness', () => {
    expect(collaborativePoolsMigration).toContain(
      'primary key (room_id, user_id)',
    )
    expect(collaborativePoolsMigration).toContain(
      'list.id = p_list_id and list.owner_user_id = v_uid',
    )
    expect(collaborativePoolsMigration).toContain(
      'from app_private.user_saved_list_entries entry',
    )
    expect(collaborativePoolsMigration).toContain(
      'set is_ready = false\n    where room_id = p_room_id and is_active',
    )
    expect(collaborativePoolsMigration).toContain(
      "then contribution.source_list_id\n      else null",
    )
    expect(collaborativePoolsMigration).not.toMatch(
      /'manhwa_ids'\s*,[\s\S]{0,500}multiplayer_contributions_state/,
    )
  })

  it('deduplicates, excludes daily answers, and allocates complete random schedules', () => {
    expect(collaborativePoolsMigration).toContain(
      'select distinct entry.manhwa_id',
    )
    expect(collaborativePoolsMigration).toContain(
      'daily.answer_id = entry.manhwa_id',
    )
    expect(
      collaborativePoolsMigration.match(
        /daily\.answer_id = entry\.manhwa_id/g,
      ),
    ).toHaveLength(6)
    expect(collaborativePoolsMigration).toContain(
      'for v_attempt in 1..32 loop',
    )
    expect(collaborativePoolsMigration).toContain(
      'order by random()\n          limit 3',
    )
    expect(collaborativePoolsMigration).toContain(
      'not (entry.manhwa_id = any(v_used_ids))',
    )
    expect(collaborativePoolsMigration).toContain(
      "'collaborative_schedule_unavailable'",
    )
    expect(collaborativePoolsMigration).toContain(
      "'list_contribution_required'",
    )
  })

  it('starts collaborative matches on a single shared list', () => {
    expect(singleContributorMigration).toContain(
      "'required_contributor_count', 1",
    )
    expect(singleContributorMigration).toContain(
      "'active_member_count', (",
    )
    expect(singleContributorMigration).toMatch(
      /pool_source = 'collaborative_lists' and not exists \([\s\S]*?multiplayer_list_contributions contribution[\s\S]*?member\.is_active[\s\S]*?'list_contributors_missing'/,
    )
    expect(singleContributorMigration).not.toContain(
      "'list_contribution_required'",
    )
    expect(singleContributorMigration).toMatch(
      /function public\.multiplayer_set_ready[\s\S]*?multiplayer_set_ready_impl/,
    )
    expect(singleContributorMigration).toContain(
      'grant execute on function public.multiplayer_set_ready(uuid, boolean, text)\n  to authenticated, service_role',
    )
  })

  it('lets a saved list grow to the whole catalog', () => {
    expect(fullCatalogCapMigration).toContain(
      'cardinality(p_manhwa_ids) < 3',
    )
    expect(fullCatalogCapMigration).not.toContain('between 3 and 100')
    expect(fullCatalogCapMigration).toContain(
      'add constraint user_saved_list_entries_position_check check ("position" >= 0)',
    )
    expect(fullCatalogCapMigration).toContain(
      'check (entry_count >= 3)',
    )
    expect(fullCatalogCapMigration).toContain('v_entry_count < 3')
    expect(fullCatalogCapMigration).toContain(
      "'list_title_not_in_catalog'",
    )
    expect(fullCatalogCapMigration).toContain(
      'grant execute on function public.multiplayer_set_list_contribution(uuid, uuid, text)\n  to authenticated, service_role',
    )
  })

  it('cascades room snapshots and exports account-owned lists only to service role', () => {
    expect(collaborativePoolsMigration).toContain(
      'references app_private.multiplayer_members (room_id, user_id)\n    on delete cascade',
    )
    expect(collaborativePoolsMigration).toContain(
      'references auth.users (id) on delete cascade',
    )
    expect(collaborativePoolsMigration).toContain(
      'revoke all on function public.export_saved_lists_account(uuid)\n  from public, anon, authenticated',
    )
    expect(collaborativePoolsMigration).toContain(
      'grant execute on function public.export_saved_lists_account(uuid)\n  to service_role',
    )
  })
})
