import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readSql(relativePath: string): string {
  return fs
    .readFileSync(path.resolve(relativePath), 'utf8')
    .replace(/\r\n/g, '\n')
}

const ledgerMigration = readSql(
  'supabase/migrations/20260720094230_harden_private_ledger_and_grants.sql',
)

const playMigration = readSql(
  'supabase/migrations/20260720094451_server_authoritative_daily_play.sql',
)

const guestAnswerMigration = readSql(
  'supabase/migrations/20260729180338_guest_play_state_answer_id.sql',
)
const ownerAnalyticsMigration = readSql(
  'supabase/migrations/20260809114805_owner_analytics.sql',
)
const newsKindsMigration = readSql(
  'supabase/migrations/20260811050059_news_item_kinds.sql',
)
const newsCommentsMigration = readSql(
  'supabase/migrations/20260811112251_news_comments_moderation.sql',
)
const newsCommentAbuseMigration = readSql(
  'supabase/migrations/20260811143833_harden_news_comment_abuse.sql',
)

describe('private ledger hardening migration contracts', () => {
  it('enables RLS on point_transactions and keeps client DML revoked', () => {
    expect(ledgerMigration).toContain(
      'alter table app_private.point_transactions enable row level security',
    )
    expect(ledgerMigration).toContain(
      'revoke all on table app_private.point_transactions\n  from public, anon, authenticated',
    )
    expect(ledgerMigration).toContain(
      'revoke all on schema app_private from anon, authenticated',
    )
  })

  it('revokes client execute on after_username_change_award_secret', () => {
    expect(ledgerMigration).toContain(
      'revoke all on function app_private.after_username_change_award_secret()\n  from public, anon, authenticated',
    )
    expect(ledgerMigration).toContain(
      'grant execute on function app_private.after_username_change_award_secret()\n  to postgres, service_role',
    )
  })
})

describe('owner analytics migration contracts', () => {
  it('exposes owner analytics only through service-role wrappers', () => {
    expect(ownerAnalyticsMigration).toContain(
      'grant execute on function public.moderation_get_owner_analytics',
    )
    expect(ownerAnalyticsMigration).toContain('to service_role')
    expect(ownerAnalyticsMigration).toContain(
      'revoke all on function public.moderation_get_owner_analytics',
    )
    expect(ownerAnalyticsMigration).not.toContain('guest_daily_plays')
    expect(ownerAnalyticsMigration).not.toContain('record_guest_play_analytics')
  })

  it('requires owner role, bounds queries, and excludes flagged accounts', () => {
    expect(ownerAnalyticsMigration).toContain(
      'app_private.assert_moderation_actor(p_actor_id, true)',
    )
    expect(ownerAnalyticsMigration).toContain('v_end - v_start > 89')
    expect(ownerAnalyticsMigration).toContain('not coalesce(af.is_test, false)')
    expect(ownerAnalyticsMigration).toContain('not coalesce(af.is_suspicious, false)')
    expect(ownerAnalyticsMigration).toContain("'analytics_query'")
  })

  it('aggregates signed-in play only', () => {
    expect(ownerAnalyticsMigration).toContain("jsonb_build_object('segment', 'signed')")
    expect(ownerAnalyticsMigration).toContain('app_private.daily_attempts')
    expect(ownerAnalyticsMigration).toContain('public.daily_completions')
    expect(ownerAnalyticsMigration).not.toContain('guest_hash')
    expect(ownerAnalyticsMigration).not.toContain('ip_address')
    expect(ownerAnalyticsMigration).not.toContain('user_agent')
  })
})

describe('news item kinds migration contracts', () => {
  it('supports release updates and announcements with conditional versions', () => {
    expect(newsKindsMigration).toContain("check (kind in ('update', 'announcement'))")
    expect(newsKindsMigration).toContain(
      "check (kind <> 'update' or not published or version is not null)",
    )
    expect(newsKindsMigration).toContain("'kind', p_row.kind")
    expect(newsKindsMigration).toContain(
      "if v_published and v_kind = 'update' and v_version is null then",
    )
  })

  it('keeps news authoring service-role only', () => {
    expect(newsKindsMigration).toContain(
      'security definer\nset search_path to',
    )
    expect(newsKindsMigration).toContain(
      ') from public, anon, authenticated;\ngrant execute on function public.moderation_upsert_site_update',
    )
    expect(newsKindsMigration).toContain(') to service_role;')
  })
})

describe('news comments migration contracts', () => {
  it('keeps the comment table RPC-only and allows public reads only through a function', () => {
    expect(newsCommentsMigration).toContain(
      'alter table public.site_update_comments enable row level security',
    )
    expect(newsCommentsMigration).toContain(
      'revoke all on table public.site_update_comments from public, anon, authenticated',
    )
    expect(newsCommentsMigration).toContain(
      'grant execute on function public.get_site_update_comments(text, integer, integer)\n  to anon, authenticated, service_role',
    )
    expect(newsCommentsMigration).toContain(
      'grant execute on function public.post_site_update_comment(text, text)\n  to authenticated, service_role',
    )
  })

  it('derives authors from auth, rate limits posting, and hides private ids publicly', () => {
    expect(newsCommentsMigration).toContain('v_uid uuid := auth.uid()')
    expect(newsCommentsMigration).toContain(
      "consume_rpc_rate_limit(v_uid, 'post_site_update_comment', 5, 60)",
    )
    expect(newsCommentsMigration).toContain(
      "'author_id', case when p_include_private then p_row.author_id else null end",
    )
    expect(newsCommentsMigration).toContain('app_private.can_appear_publicly(v_uid)')
    expect(newsCommentsMigration).toContain(
      "'stage_id', coalesce(uap.equipped_stage_id, 'stage_blossom_courtyard')",
    )
  })

  it('audits soft removal and protects comment bans with staff target rules', () => {
    expect(newsCommentsMigration).toContain('app_private.assert_moderation_actor')
    expect(newsCommentsMigration).toContain('app_private.assert_can_target')
    expect(newsCommentsMigration).toContain("'remove_news_comment'")
    expect(newsCommentsMigration).toContain("'issue_comment_ban'")
    expect(newsCommentsMigration).toContain("kind = 'comment_ban'")
    expect(newsCommentsMigration).toContain("v_actor_role <> 'owner'")
  })
})

describe('news comment abuse hardening migration contracts', () => {
  it('keeps filter configuration and aggregate telemetry private', () => {
    expect(newsCommentAbuseMigration).toContain(
      'alter table app_private.comment_filter_rules enable row level security',
    )
    expect(newsCommentAbuseMigration).toContain(
      'revoke all on table app_private.comment_filter_aggregates from public, anon, authenticated',
    )
    expect(newsCommentAbuseMigration).not.toContain('rejected_body')
  })

  it('enforces burst, hourly, and daily limits before classification', () => {
    const burst = newsCommentAbuseMigration.indexOf(
      "consume_rpc_rate_limit(v_uid, 'post_site_update_comment', 5, 60)",
    )
    const hourly = newsCommentAbuseMigration.indexOf(
      "consume_rpc_rate_limit(v_uid, 'post_site_update_comment_hour', 10, 3600)",
    )
    const daily = newsCommentAbuseMigration.indexOf(
      "consume_rpc_rate_limit(v_uid, 'post_site_update_comment_day', 20, 86400)",
    )
    const classify = newsCommentAbuseMigration.indexOf(
      'app_private.classify_comment_body(v_body)',
    )
    expect(burst).toBeGreaterThan(-1)
    expect(hourly).toBeGreaterThan(burst)
    expect(daily).toBeGreaterThan(hourly)
    expect(classify).toBeGreaterThan(daily)
  })

  it('serializes duplicate checks and never publishes pending comments', () => {
    expect(newsCommentAbuseMigration).toContain('pg_advisory_xact_lock')
    expect(newsCommentAbuseMigration).toContain("'recent_duplicate'")
    expect(newsCommentAbuseMigration).toContain("where status = 'pending'")
    expect(newsCommentAbuseMigration).toContain("'outcome', 'pending'")
    expect(newsCommentsMigration).toContain("c.status = 'visible'")
  })

  it('makes quarantine review staff-only and audits decisions', () => {
    expect(newsCommentAbuseMigration).toContain(
      "v_status not in ('visible', 'pending', 'removed')",
    )
    expect(newsCommentAbuseMigration).toContain("'pending_total'")
    expect(newsCommentAbuseMigration).toContain("'approve_quarantined_news_comment'")
    expect(newsCommentAbuseMigration).toContain("'remove_quarantined_news_comment'")
    expect(newsCommentAbuseMigration).toContain(
      'grant execute on function public.moderation_list_site_update_comments',
    )
    expect(newsCommentAbuseMigration).not.toContain(
      'to authenticated;\ngrant execute on function public.moderation_list_site_update_comments',
    )
  })
})

describe('server-authoritative daily play migration contracts', () => {
  it('restricts daily_puzzles SELECT to past/archive dates only', () => {
    expect(playMigration).toContain('create policy daily_puzzles_select_past')
    expect(playMigration).toContain('using (date_key < public.current_utc_date_key())')
    expect(playMigration).not.toMatch(
      /daily_puzzles_select_past_and_today[\s\S]*date_key <= public\.current_utc_date_key/,
    )
  })

  it('exposes the attempt / guess / finalize RPC triad with fixed search_path', () => {
    for (const name of [
      'get_daily_play_state',
      'start_daily_attempt',
      'submit_daily_guess',
      'finalize_daily_attempt',
    ]) {
      expect(playMigration).toContain(`function public.${name}`)
    }
    expect(playMigration).toContain("set search_path to 'pg_catalog', 'app_private', 'public'")
    expect(playMigration).toContain(
      'grant execute on function public.start_daily_attempt(text, text, boolean, text)\n  to authenticated, service_role',
    )
    expect(playMigration).toContain(
      'revoke all on function public.submit_daily_guess(text, text, integer, integer, text)\n  from public, anon',
    )
  })

  it('deprecates fabricated-history completion RPCs with compat errors', () => {
    expect(playMigration).toContain("'deprecated_use_attempt_flow'")
    expect(playMigration).toContain('Use start_daily_attempt / submit_daily_guess / finalize_daily_attempt')
    expect(playMigration).toMatch(
      /create or replace function public\.complete_daily_mode_with_reward\([\s\S]*?deprecated_use_attempt_flow/,
    )
  })

  it('validates bonus names without a trusted boolean and stubs the old signature', () => {
    expect(playMigration).toContain("'deprecated_use_guess_payload'")
    expect(playMigration).toContain(
      'function public.complete_bonus_name_with_reward(\n  p_mode text,\n  p_taste text,\n  p_guessed_character_id integer,\n  p_guess_label text default null\n)',
    )
    expect(playMigration).toContain("'bonus_metadata_unavailable'")
    expect(playMigration).toContain('app_private.normalize_bonus_guess_label')
  })

  it('disables unverified rewarded-ad point claims', () => {
    expect(playMigration).toContain("'provider_verification_required'")
    expect(playMigration).toContain('Never awards points')
  })

  it('makes client-only secret events non-economic', () => {
    expect(playMigration).toContain('try_award_secret_cosmetic')
    expect(playMigration).toContain("when 'hard_mode_on' then")
    expect(playMigration).toContain(
      '-- Cosmetic/economic unlock for hard mode is server-gated via completions.',
    )
    expect(playMigration).toContain("'secret_konami'")
    expect(playMigration).toMatch(
      /set point_reward = 0\s+where id in \([\s\S]*'secret_konami'[\s\S]*'secret_four_roads'/,
    )
    expect(playMigration).toContain("'secret_hard_mode'")
    expect(playMigration).toContain("'secret_hint_denied'")
    expect(playMigration).not.toContain(
      "set point_reward = 25\nwhere id = 'secret_hard_mode'",
    )
    expect(playMigration).toContain(
      "perform app_private.try_award_secret_cosmetic(p_user_id, 'secret_hard_mode')",
    )
    expect(playMigration).toContain(
      "perform app_private.try_award_secret_cosmetic(p_user_id, 'secret_hint_denied')",
    )
  })

  it('allowlists public clue/fingerprint meta and hides active Character ids', () => {
    expect(playMigration).toContain(
      "'clue', p_meta -> 'public_clue'",
    )
    expect(playMigration).toContain(
      "'fingerprint', p_meta -> 'answer_fingerprint'",
    )
    expect(playMigration).not.toContain(
      "'character_id', v_character_id,\n    'meta'",
    )
    expect(playMigration).toContain(
      "'character_id', case when v_terminal then p_attempt.character_id else null end",
    )
    expect(playMigration).toContain("selected_clue - 'character_id'")
  })

  it('repairs completion when submit_daily_guess sees a terminal attempt', () => {
    expect(playMigration).toMatch(
      /if v_attempt\.status is distinct from 'active' then\s+v_completion := app_private\.insert_completion_from_attempt\(v_attempt\);[\s\S]*?'reason', 'already_terminal'[\s\S]*?'completion', v_completion[\s\S]*?'finalized', true/,
    )
  })

  it('keeps private attempt tables locked to service roles', () => {
    expect(playMigration).toContain('create table if not exists app_private.daily_attempts')
    expect(playMigration).toContain(
      'alter table app_private.daily_attempts enable row level security',
    )
    expect(playMigration).toContain(
      'revoke all on table app_private.daily_attempts\n  from public, anon, authenticated',
    )
  })

  it('rate-limits attempt mutations', () => {
    expect(playMigration).toContain(
      "consume_rpc_rate_limit(v_uid, 'submit_daily_guess', 30, 60)",
    )
    expect(playMigration).toContain(
      "consume_rpc_rate_limit(v_uid, 'start_daily_attempt', 20, 60)",
    )
    expect(playMigration).toContain(
      "consume_rpc_rate_limit(v_uid, 'finalize_daily_attempt', 20, 60)",
    )
  })
})

describe('guest play-state answer_id migration contracts', () => {
  it('returns answer_id for anon and hides it for authenticated callers', () => {
    expect(guestAnswerMigration).toContain('v_guest boolean := (v_uid is null)')
    expect(guestAnswerMigration).toContain(
      "'answer_id', case when v_guest then v_answer_id else null end",
    )
    expect(guestAnswerMigration).toContain(
      "'character_id', case when v_guest then v_character_id else null end",
    )
    expect(guestAnswerMigration).toContain(
      'Guests (anon) receive answer_id for local validation',
    )
  })
})
