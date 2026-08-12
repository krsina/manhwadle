-- First-try solves require an opening guess with no free hints.
-- Reveal more (hints_used > 0) gives up first-try XP, bonus golden, and secret_perfect.

create or replace function app_private.award_daily_completion_points(
  p_user_id uuid,
  p_date_key text,
  p_mode text,
  p_outcome text,
  p_guess_count integer,
  p_max_guesses integer,
  p_surrendered boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_base integer := 0;
  v_first_try integer := 0;
  v_streak integer := 0;
  v_mult numeric := 1;
  v_reward integer := 0;
  v_hints integer := 0;
begin
  if p_outcome = 'won' then
    v_base := 100;
    select coalesce(dc.hints_used, 0)
    into v_hints
    from public.daily_completions dc
    where dc.user_id = p_user_id
      and dc.date_key = p_date_key
      and dc.mode = p_mode;
    v_hints := coalesce(v_hints, 0);
    if coalesce(p_guess_count, 0) = 1 and v_hints = 0 then
      v_first_try := 3;
    end if;
  end if;

  if v_base = 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  select coalesce(uss.any_current_streak, 0)
  into v_streak
  from public.user_streak_summary uss
  where uss.user_id = p_user_id;

  v_streak := coalesce(v_streak, 0);
  v_mult := app_private.play_xp_streak_multiplier(v_streak);
  v_reward := floor((v_base + v_first_try)::numeric * v_mult)::integer;

  if v_reward <= 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  return app_private.apply_play_point_transaction(
    p_user_id,
    v_reward,
    'daily_completion',
    p_date_key || ':' || p_mode,
    p_date_key,
    jsonb_build_object(
      'mode', p_mode,
      'outcome', p_outcome,
      'base', v_base,
      'first_try_bonus', v_first_try,
      'hints_used', v_hints,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded_requested', v_reward,
      'surrendered', coalesce(p_surrendered, false),
      'max_guesses', p_max_guesses
    )
  );
end;
$$;

revoke all on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) to postgres, service_role;

comment on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) is
  'Win-only play XP: base 100, first-try +3 (guess_count=1 and hints_used=0), streak mult up to 1.5x, daily cap.';

-- Bonus golden / double-solve also requires no free hints.
create or replace function public.complete_bonus_name_with_reward(
  p_mode text,
  p_taste text,
  p_guessed_character_id integer,
  p_guess_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_completion public.daily_completions%rowtype;
  v_meta jsonb;
  v_expected_id integer;
  v_aliases jsonb;
  v_norm text;
  v_alias text;
  v_match boolean := false;
  v_award jsonb;
  v_balance integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;
  if app_private.is_cloud_banned(v_uid) then
    raise exception 'Cloud banned'
      using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'Invalid mode'
      using errcode = '22023';
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    raise exception 'Invalid taste'
      using errcode = '22023';
  end if;

  perform app_private.ensure_shop_account(v_uid);

  select *
  into v_completion
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'no_completion',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if v_completion.outcome is distinct from 'won'
     or v_completion.guess_count <> 1
     or coalesce(v_completion.hints_used, 0) <> 0 then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'not_first_try_win',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if v_completion.taste is distinct from p_taste then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'taste_mismatch',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  select dp.meta, dp.character_id
  into v_meta, v_expected_id
  from public.daily_puzzles dp
  where dp.date_key = v_date_key
    and dp.mode = p_mode
    and dp.taste = p_taste;

  v_meta := coalesce(v_meta, '{}'::jsonb);

  if v_meta ? 'bonus_character_id'
     and nullif(v_meta ->> 'bonus_character_id', '') is not null then
    v_expected_id := (v_meta ->> 'bonus_character_id')::integer;
  elsif p_mode = 'character' then
    -- character_id already selected above
    null;
  else
    v_expected_id := null;
  end if;

  if v_expected_id is null
     and not (v_meta ? 'bonus_name_aliases')
     and nullif(v_meta ->> 'bonus_name_normalized', '') is null then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'bonus_metadata_unavailable',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if p_guessed_character_id is not null
     and v_expected_id is not null
     and p_guessed_character_id = v_expected_id then
    v_match := true;
  end if;

  if not v_match then
    v_norm := app_private.normalize_bonus_guess_label(p_guess_label);
    if v_norm is not null then
      if v_norm = app_private.normalize_bonus_guess_label(v_meta ->> 'bonus_name_normalized') then
        v_match := true;
      elsif v_meta ? 'bonus_name_aliases'
            and jsonb_typeof(v_meta -> 'bonus_name_aliases') = 'array' then
        for v_alias in
          select value #>> '{}'
          from jsonb_array_elements(v_meta -> 'bonus_name_aliases')
        loop
          if v_norm = app_private.normalize_bonus_guess_label(v_alias) then
            v_match := true;
            exit;
          end if;
        end loop;
      end if;
    end if;
  end if;

  if not v_match then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'incorrect',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  v_award := app_private.award_bonus_name_points(v_uid, v_date_key, p_mode);

  select balance into v_balance
  from public.user_point_balances
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'applied', coalesce((v_award ->> 'applied')::boolean, false),
    'date_key', v_date_key,
    'mode', p_mode,
    'taste', p_taste,
    'point_delta', coalesce((v_award ->> 'delta')::integer, 0),
    'play_point_delta', coalesce((v_award ->> 'play_point_delta')::integer, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.complete_bonus_name_with_reward(text, text, integer, text)
  from public, anon;
grant execute on function public.complete_bonus_name_with_reward(text, text, integer, text)
  to authenticated, service_role;

comment on function public.complete_bonus_name_with_reward(text, text, integer, text) is
  'Awards bonus-name XP after a first-try win (no hints) when the guessed character id or label matches server-held puzzle meta.';

create or replace function app_private.award_secrets_from_completion(
  p_user_id uuid,
  p_outcome text,
  p_guess_count integer,
  p_max_guesses integer,
  p_hints_used integer,
  p_hard_mode boolean,
  p_surrendered boolean,
  p_completed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_hour integer;
  v_new_count integer := 0;
begin
  if p_hard_mode then
    perform app_private.try_award_secret(p_user_id, 'secret_hard_mode');
  end if;

  if p_surrendered then
    if app_private.try_award_secret(p_user_id, 'secret_surrender') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if p_outcome = 'won' and not p_surrendered then
    if coalesce(p_hints_used, 0) = 0 then
      perform app_private.try_award_secret(p_user_id, 'secret_hint_denied');
    end if;
    if p_guess_count = 1 and coalesce(p_hints_used, 0) = 0 then
      if app_private.try_award_secret(p_user_id, 'secret_perfect') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
    if p_guess_count = p_max_guesses then
      if app_private.try_award_secret(p_user_id, 'secret_slow_burn') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
  end if;

  v_hour := extract(hour from timezone('utc', p_completed_at))::integer;
  if v_hour = 23 then
    if app_private.try_award_secret(p_user_id, 'secret_last_second') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if v_new_count >= 3 then
    perform app_private.try_award_secret(p_user_id, 'secret_cascade');
  end if;

  return v_new_count;
end;
$$;

revoke all on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) to postgres, service_role;

-- Analytics: first_tries exclude hinted opening-guess wins.
create or replace function app_private.get_owner_analytics(
  p_actor_id uuid,
  p_start_date text,
  p_end_date text,
  p_mode text default null,
  p_taste text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_start date;
  v_end date;
  v_series jsonb;
  v_new_accounts bigint;
  v_signed_users bigint;
  v_all_modes_users bigint;
  v_player_days bigint;
  v_signed_starts bigint;
begin
  perform app_private.assert_moderation_actor(p_actor_id, true);
  if not app_private.consume_rpc_rate_limit(p_actor_id, 'owner_analytics', 20, 60) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  begin
    v_start := p_start_date::date;
    v_end := p_end_date::date;
  exception when others then
    raise exception 'invalid_date_range' using errcode = '22023';
  end;
  if v_end < v_start or v_end - v_start > 89 or v_end > timezone('utc', now())::date then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  if p_mode is not null and p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if p_taste is not null and p_taste not in ('action', 'romance', 'both') then
    raise exception 'invalid_taste' using errcode = '22023';
  end if;

  with eligible_attempts as (
    select da.*
    from app_private.daily_attempts da
    left join app_private.account_flags af on af.user_id = da.user_id
    where da.date_key between p_start_date and p_end_date
      and (p_mode is null or da.mode = p_mode)
      and (p_taste is null or da.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  eligible_completions as (
    select dc.*
    from public.daily_completions dc
    left join app_private.account_flags af on af.user_id = dc.user_id
    where dc.date_key between p_start_date and p_end_date
      and (p_mode is null or dc.mode = p_mode)
      and (p_taste is null or dc.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  signed_daily as (
    select
      ea.date_key,
      ea.mode,
      ea.taste,
      count(*)::bigint starts,
      count(ec.id)::bigint completions,
      count(ec.id) filter (where ec.outcome = 'won')::bigint wins,
      count(ec.id) filter (
        where ec.outcome = 'won'
          and ec.guess_count = 1
          and coalesce(ec.hints_used, 0) = 0
      )::bigint first_tries,
      count(pt.id)::bigint double_solves,
      count(distinct ea.user_id)::bigint active_users,
      coalesce(sum(ec.guess_count), 0)::bigint guess_count_total,
      coalesce(sum(ec.hints_used), 0)::bigint hints_used_total,
      count(ec.id) filter (where ec.hard_mode)::bigint hard_mode_plays,
      array[
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 1),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 2),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 3),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 4),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 5),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 6)
      ]::bigint[] guess_distribution
    from eligible_attempts ea
    left join eligible_completions ec
      on ec.user_id = ea.user_id and ec.date_key = ea.date_key and ec.mode = ea.mode
    left join app_private.point_transactions pt
      on pt.user_id = ea.user_id
      and pt.source_type = 'bonus_name'
      and pt.source_id = ea.date_key || ':' || ea.mode
    group by ea.date_key, ea.mode, ea.taste
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(s) || jsonb_build_object('segment', 'signed')
      order by s.date_key, s.mode, s.taste
    ),
    '[]'::jsonb
  )
  into v_series
  from signed_daily s;

  select count(*) into v_new_accounts
  from auth.users u
  left join app_private.account_flags af on af.user_id = u.id
  where timezone('utc', u.created_at)::date between v_start and v_end
    and not coalesce(af.is_test, false)
    and not coalesce(af.is_suspicious, false);

  with eligible as (
    select da.user_id, da.date_key, da.mode
    from app_private.daily_attempts da
    left join app_private.account_flags af on af.user_id = da.user_id
    where da.date_key between p_start_date and p_end_date
      and (p_mode is null or da.mode = p_mode)
      and (p_taste is null or da.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  per_day as (
    select user_id, date_key, count(distinct mode) modes
    from eligible group by user_id, date_key
  )
  select
    count(distinct p.user_id),
    coalesce(sum(p.modes), 0)::bigint,
    count(*) filter (where p.modes = 4)::bigint,
    count(*)::bigint
  into v_signed_users, v_signed_starts, v_all_modes_users, v_player_days
  from per_day p;

  perform app_private.audit_moderation(
    p_actor_id,
    null,
    'analytics_query',
    'Owner aggregate analytics query',
    jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'mode', p_mode,
      'taste', p_taste
    )
  );

  return jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'series', v_series,
    'new_accounts', coalesce(v_new_accounts, 0),
    'signed_active_users', coalesce(v_signed_users, 0),
    'signed_starts', coalesce(v_signed_starts, 0),
    'all_modes_player_days', coalesce(v_all_modes_users, 0),
    'signed_player_days', coalesce(v_player_days, 0),
    'generated_at', timezone('utc', now())
  );
end;
$$;

revoke all on function app_private.get_owner_analytics(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app_private.get_owner_analytics(uuid, text, text, text, text)
  to postgres, service_role;
