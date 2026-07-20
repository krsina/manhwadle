-- Exact-match leaderboard player search (no prefix / ILIKE).
-- Signed-in callers are rate-limited; anon is allowed (cheap equality lookup).

create or replace function public.search_leaderboard(
  p_board text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_board text := p_board;
  v_uid uuid := auth.uid();
  v_norm text;
  v_today text := public.current_utc_date_key();
  v_public_id uuid;
  v_username text;
  v_value integer;
  v_tie_at timestamptz;
  v_avatar text;
  v_stage text;
  v_rank bigint;
begin
  if v_board not in ('all_mode_streak', 'longest_streak', 'current_streak') then
    raise exception 'Invalid board'
      using errcode = '22023';
  end if;

  v_norm := lower(btrim(coalesce(p_username, '')));
  if v_norm = '' or char_length(v_norm) < 3 or char_length(v_norm) > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_username');
  end if;
  if v_norm !~ '^[a-z0-9_]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_username');
  end if;

  -- Per-user rate limit when signed in (anon shares get_leaderboard's open read path).
  if v_uid is not null then
    if not app_private.consume_rpc_rate_limit(v_uid, 'search_leaderboard', 30, 60) then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  select
    pp.public_id,
    pp.username,
    case v_board
      when 'all_mode_streak' then uss.all_max_streak
      when 'longest_streak' then uss.any_max_streak
      when 'current_streak' then app_private.live_current_streak(
        uss.any_current_streak,
        uss.last_any_date_key,
        v_today,
        '{}'::text[]
      )
    end,
    case v_board
      when 'all_mode_streak' then uss.all_max_streak_at
      when 'longest_streak' then uss.any_max_streak_at
      when 'current_streak' then uss.updated_at
    end,
    coalesce(nullif(trim(uap.equipped_item_id), ''), 'avatar_default_female'),
    coalesce(nullif(trim(uap.equipped_stage_id), ''), 'stage_blossom_courtyard')
  into
    v_public_id,
    v_username,
    v_value,
    v_tie_at,
    v_avatar,
    v_stage
  from public.public_profiles pp
  join public.user_streak_summary uss on uss.user_id = pp.user_id
  left join public.user_avatar_profiles uap on uap.user_id = pp.user_id
  where coalesce(pp.username_normalized, lower(pp.username)) = v_norm
    and app_private.is_leaderboard_eligible(pp.user_id)
  limit 1;

  if v_public_id is null or v_value is null or v_value <= 0 then
    return jsonb_build_object('ok', true, 'board', v_board, 'entry', null);
  end if;

  -- Unique ordinal rank: count players strictly ahead + 1.
  select 1 + count(*)
  into v_rank
  from (
    select
      pp.public_id,
      case v_board
        when 'all_mode_streak' then uss.all_max_streak
        when 'longest_streak' then uss.any_max_streak
        when 'current_streak' then app_private.live_current_streak(
          uss.any_current_streak,
          uss.last_any_date_key,
          v_today,
          '{}'::text[]
        )
      end as value,
      case v_board
        when 'all_mode_streak' then uss.all_max_streak_at
        when 'longest_streak' then uss.any_max_streak_at
        when 'current_streak' then uss.updated_at
      end as tie_at
    from public.user_streak_summary uss
    join public.public_profiles pp on pp.user_id = uss.user_id
    where app_private.is_leaderboard_eligible(uss.user_id)
      and pp.username is not null
  ) e
  where e.value > 0
    and (
      e.value > v_value
      or (
        e.value = v_value
        and (
          (e.tie_at is not null and v_tie_at is not null and e.tie_at < v_tie_at)
          or (e.tie_at is not null and v_tie_at is null)
          or (
            e.tie_at is not distinct from v_tie_at
            and e.public_id::text < v_public_id::text
          )
        )
      )
    );

  return jsonb_build_object(
    'ok', true,
    'board', v_board,
    'entry', jsonb_build_object(
      'rank', v_rank,
      'username', v_username,
      'value', v_value,
      'public_id', v_public_id::text,
      'equipped_avatar_id', v_avatar,
      'equipped_stage_id', v_stage
    )
  );
end;
$$;

revoke all on function public.search_leaderboard(text, text) from public;
grant execute on function public.search_leaderboard(text, text)
  to anon, authenticated, service_role;

comment on function public.search_leaderboard(text, text) is
  'Exact username_normalized lookup on a streak board. Returns one ranked entry or null. '
  'No prefix matching. Authenticated callers are rate-limited (30/min).';
