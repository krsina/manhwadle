-- Include equipped avatar ids on public Top Rankings rows (bust crop in UI).

create or replace function public.get_leaderboard(
  p_board text,
  p_limit integer default 25,
  p_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_board text := p_board;
  v_cursor_json jsonb;
  v_cursor_value integer;
  v_cursor_u text;
  v_cursor_p text;
  v_rows jsonb := '[]'::jsonb;
  v_next text := null;
  v_has_more boolean := false;
  v_last_value integer;
  v_last_u text;
  v_last_p text;
  v_today text := public.current_utc_date_key();
begin
  if v_board not in ('all_mode_streak', 'longest_streak', 'current_streak') then
    raise exception 'Invalid board'
      using errcode = '22023';
  end if;

  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      if (v_cursor_json->>'v')::integer <> 1
         or v_cursor_json->>'board' is distinct from v_board then
        raise exception 'Invalid cursor'
          using errcode = '22023';
      end if;
      v_cursor_value := (v_cursor_json->>'value')::integer;
      v_cursor_u := nullif(trim(v_cursor_json->>'u'), '');
      v_cursor_p := nullif(trim(v_cursor_json->>'p'), '');
      if v_cursor_value is null
         or v_cursor_u is null
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
          'equipped_avatar_id', q.equipped_avatar_id
        )
        order by q.value desc, q.username_normalized asc, q.public_id asc
      ) filter (where q.page_pos <= v_limit),
      '[]'::jsonb
    ),
    bool_or(q.page_pos = v_limit + 1),
    max(q.value) filter (where q.page_pos = v_limit),
    max(q.username_normalized) filter (where q.page_pos = v_limit),
    max(q.public_id) filter (where q.page_pos = v_limit)
  into v_rows, v_has_more, v_last_value, v_last_u, v_last_p
  from (
    select
      r.*,
      row_number() over (
        order by r.value desc, r.username_normalized asc, r.public_id asc
      ) as page_pos
    from (
      select
        dense_rank() over (order by e.value desc) as rank,
        e.username,
        e.value,
        e.public_id::text as public_id,
        e.username_normalized,
        e.equipped_avatar_id
      from (
        select
          pp.public_id,
          pp.username,
          coalesce(pp.username_normalized, lower(pp.username)) as username_normalized,
          coalesce(nullif(trim(uap.equipped_item_id), ''), 'avatar_default_female')
            as equipped_avatar_id,
          case v_board
            when 'all_mode_streak' then uss.all_max_streak
            when 'longest_streak' then uss.any_max_streak
            when 'current_streak' then app_private.live_current_streak(
              uss.any_current_streak,
              uss.last_any_date_key,
              v_today,
              '{}'::text[]
            )
          end as value
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
         and r.username_normalized > v_cursor_u
       )
       or (
         r.value = v_cursor_value
         and r.username_normalized = v_cursor_u
         and r.public_id > v_cursor_p
       )
  ) q
  where q.page_pos <= v_limit + 1;

  if v_has_more and v_last_value is not null then
    v_next := encode(
      convert_to(
        jsonb_build_object(
          'v', 1,
          'board', v_board,
          'value', v_last_value,
          'u', v_last_u,
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
  'Public Top Rankings page (dense ranks, keyset cursor). Entries include equipped_avatar_id for bust previews.';
