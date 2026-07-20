-- Rate-limit signed-in leaderboard reads (abuse control).
-- Keeps boards live (no response cache) so new completions show on the next fetch.
-- Anon stays open: per-user windows need auth.uid(); edge/CDN limits can cover anon later.
-- Limits are generous (60/min) so normal tabbing / refresh / load-more stays fine.

-- ---------------------------------------------------------------------------
-- get_leaderboard: signed-in callers only
-- ---------------------------------------------------------------------------
-- Drop STABLE: consume_rpc_rate_limit writes to app_private.rpc_rate_windows.

create or replace function public.get_leaderboard(
  p_board text,
  p_limit integer default 25,
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_board text := p_board;
  v_cursor_json jsonb;
  v_cursor_value integer;
  v_cursor_t timestamptz;
  v_cursor_p text;
  v_rows jsonb := '[]'::jsonb;
  v_next text := null;
  v_has_more boolean := false;
  v_last_value integer;
  v_last_t timestamptz;
  v_last_p text;
  v_today text := public.current_utc_date_key();
begin
  if v_board not in ('all_mode_streak', 'longest_streak', 'current_streak') then
    raise exception 'Invalid board'
      using errcode = '22023';
  end if;

  -- Authenticated flood control; anon shares the open public read path.
  if v_uid is not null then
    if not app_private.consume_rpc_rate_limit(v_uid, 'get_leaderboard', 60, 60) then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      if (v_cursor_json->>'v')::integer <> 2
         or v_cursor_json->>'board' is distinct from v_board then
        raise exception 'Invalid cursor'
          using errcode = '22023';
      end if;
      v_cursor_value := (v_cursor_json->>'value')::integer;
      v_cursor_t := (v_cursor_json->>'t')::timestamptz;
      v_cursor_p := nullif(trim(v_cursor_json->>'p'), '');
      if v_cursor_value is null
         or v_cursor_t is null
         or v_cursor_p is null
         or v_cursor_p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid cursor'
          using errcode = '22023';
      end if;
    exception
      when others then
        raise exception 'Invalid cursor'
          using errcode = '22023';
    end;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', q.rank,
          'username', q.username,
          'value', q.value,
          'public_id', q.public_id,
          'equipped_avatar_id', q.equipped_avatar_id,
          'equipped_stage_id', q.equipped_stage_id
        )
        order by q.value desc, q.tie_at asc nulls last, q.public_id asc
      ) filter (where q.page_pos <= v_limit),
      '[]'::jsonb
    ),
    bool_or(q.page_pos = v_limit + 1),
    max(q.value) filter (where q.page_pos = v_limit),
    max(q.tie_at) filter (where q.page_pos = v_limit),
    max(q.public_id) filter (where q.page_pos = v_limit)
  into v_rows, v_has_more, v_last_value, v_last_t, v_last_p
  from (
    select
      r.*,
      row_number() over (
        order by r.value desc, r.tie_at asc nulls last, r.public_id asc
      ) as page_pos
    from (
      select
        row_number() over (
          order by e.value desc, e.tie_at asc nulls last, e.public_id asc
        ) as rank,
        e.username,
        e.value,
        e.public_id::text as public_id,
        e.tie_at,
        e.equipped_avatar_id,
        e.equipped_stage_id
      from (
        select
          pp.public_id,
          pp.username,
          coalesce(nullif(trim(uap.equipped_item_id), ''), 'avatar_default_female')
            as equipped_avatar_id,
          coalesce(nullif(trim(uap.equipped_stage_id), ''), 'stage_blossom_courtyard')
            as equipped_stage_id,
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
        left join public.user_avatar_profiles uap on uap.user_id = uss.user_id
        where app_private.is_leaderboard_eligible(uss.user_id)
          and pp.username is not null
          and case v_board
            when 'all_mode_streak' then uss.all_max_streak
            when 'longest_streak' then uss.any_max_streak
            when 'current_streak' then app_private.live_current_streak(
              uss.any_current_streak,
              uss.last_any_date_key,
              v_today,
              '{}'::text[]
            )
          end > 0
      ) e
    ) r
    where v_cursor_value is null
       or r.value < v_cursor_value
       or (
         r.value = v_cursor_value
         and r.tie_at > v_cursor_t
       )
       or (
         r.value = v_cursor_value
         and r.tie_at is not distinct from v_cursor_t
         and r.public_id > v_cursor_p
       )
  ) q
  where q.page_pos <= v_limit + 1;

  if v_has_more and v_last_value is not null and v_last_t is not null then
    v_next := encode(
      convert_to(
        jsonb_build_object(
          'v', 2,
          'board', v_board,
          'value', v_last_value,
          't', v_last_t,
          'p', v_last_p
        )::text,
        'utf8'
      ),
      'base64'
    );
  else
    v_has_more := false;
    v_next := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'board', v_board,
    'entries', v_rows,
    'next_cursor', v_next,
    'has_more', coalesce(v_has_more, false)
  );
end;
$$;

comment on function public.get_leaderboard(text, integer, text) is
  'Public Top Rankings page (unique ordinal ranks, keyset cursor v2). '
  'Order: value desc, first-achieved asc, public_id asc. '
  'Entries include equipped_avatar_id and equipped_stage_id. '
  'Signed-in callers rate-limited (60/min); responses stay live (no cache).';

-- ---------------------------------------------------------------------------
-- get_my_leaderboard_standing: always authenticated
-- ---------------------------------------------------------------------------

create or replace function public.get_my_leaderboard_standing()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_eligible boolean;
  v_summary public.user_streak_summary%rowtype;
  v_username text;
  v_public_id uuid;
  v_today text := public.current_utc_date_key();
  v_neutral text[];
  v_any_current integer;
  v_all_current integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'get_my_leaderboard_standing', 60, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_eligible := app_private.is_leaderboard_eligible(v_uid);
  select * into v_summary from public.user_streak_summary where user_id = v_uid;
  select pp.username, pp.public_id into v_username, v_public_id
  from public.public_profiles pp where pp.user_id = v_uid;

  v_neutral := app_private.collect_neutral_all_mode_dates(
    app_private.leaderboard_epoch_date(),
    v_today
  );
  v_any_current := app_private.live_current_streak(
    coalesce(v_summary.any_current_streak, 0),
    v_summary.last_any_date_key,
    v_today,
    '{}'::text[]
  );
  v_all_current := app_private.live_current_streak(
    coalesce(v_summary.all_current_streak, 0),
    v_summary.last_all_date_key,
    v_today,
    v_neutral
  );

  return jsonb_build_object(
    'ok', true,
    'eligible', v_eligible,
    'username', v_username,
    'public_id', v_public_id,
    'any_current_streak', v_any_current,
    'any_max_streak', coalesce(v_summary.any_max_streak, 0),
    'all_current_streak', v_all_current,
    'all_max_streak', coalesce(v_summary.all_max_streak, 0),
    'total_completions', coalesce(v_summary.total_completions, 0),
    'boards', jsonb_build_object(
      'all_mode_streak', jsonb_build_object(
        'value', coalesce(v_summary.all_max_streak, 0),
        'rank', case when v_eligible then (
          select x.ord_rank
          from (
            select
              uss.user_id,
              row_number() over (
                order by uss.all_max_streak desc,
                  uss.all_max_streak_at asc nulls last,
                  pp.public_id asc
              ) as ord_rank
            from public.user_streak_summary uss
            join public.public_profiles pp on pp.user_id = uss.user_id
            where app_private.is_leaderboard_eligible(uss.user_id)
              and uss.all_max_streak > 0
              and pp.username is not null
          ) x
          where x.user_id = v_uid
        ) else null end
      ),
      'longest_streak', jsonb_build_object(
        'value', coalesce(v_summary.any_max_streak, 0),
        'rank', case when v_eligible then (
          select x.ord_rank
          from (
            select
              uss.user_id,
              row_number() over (
                order by uss.any_max_streak desc,
                  uss.any_max_streak_at asc nulls last,
                  pp.public_id asc
              ) as ord_rank
            from public.user_streak_summary uss
            join public.public_profiles pp on pp.user_id = uss.user_id
            where app_private.is_leaderboard_eligible(uss.user_id)
              and uss.any_max_streak > 0
              and pp.username is not null
          ) x
          where x.user_id = v_uid
        ) else null end
      ),
      'current_streak', jsonb_build_object(
        'value', v_any_current,
        'rank', case when v_eligible then (
          select x.ord_rank
          from (
            select
              uss.user_id,
              row_number() over (
                order by app_private.live_current_streak(
                  uss.any_current_streak,
                  uss.last_any_date_key,
                  v_today,
                  '{}'::text[]
                ) desc,
                  uss.updated_at asc,
                  pp.public_id asc
              ) as ord_rank
            from public.user_streak_summary uss
            join public.public_profiles pp on pp.user_id = uss.user_id
            where app_private.is_leaderboard_eligible(uss.user_id)
              and pp.username is not null
              and app_private.live_current_streak(
                uss.any_current_streak,
                uss.last_any_date_key,
                v_today,
                '{}'::text[]
              ) > 0
          ) x
          where x.user_id = v_uid
        ) else null end
      )
    )
  );
end;
$$;

comment on function public.get_my_leaderboard_standing() is
  'Own standing with live current-streak decay. Board ranks are unique ordinals '
  '(value desc, first-achieved asc, public_id asc). '
  'Rate-limited (60/min).';
