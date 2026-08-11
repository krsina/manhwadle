-- Collaborative Versus rooms only need one shared list, not one per player.

create or replace function app_private.multiplayer_pool_summary(
  p_room_id uuid,
  p_modes text[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select jsonb_build_object(
    'contributor_count', (
      select count(*)::integer
      from app_private.multiplayer_list_contributions contribution
      join app_private.multiplayer_members member
        on member.room_id = contribution.room_id
       and member.user_id = contribution.user_id
      where contribution.room_id = p_room_id and member.is_active
    ),
    -- One shared list is enough to seed the room; extra lists only widen it.
    'required_contributor_count', 1,
    'active_member_count', (
      select count(*)::integer
      from app_private.multiplayer_members member
      where member.room_id = p_room_id and member.is_active
    ),
    'per_mode_eligible_counts', coalesce((
      select jsonb_object_agg(selected.mode, (
        select count(distinct entry.manhwa_id)::integer
        from app_private.multiplayer_list_contribution_entries entry
        where entry.room_id = p_room_id
          and exists (
            select 1
            from public.puzzle_pool_entries pool
            where pool.manhwa_id = entry.manhwa_id
              and pool.mode = selected.mode
              and app_private.multiplayer_normalize_clue(
                selected.mode, pool.meta
              ) is not null
          )
          and not exists (
            select 1 from public.daily_puzzles daily
            where daily.date_key = public.current_utc_date_key()
              and daily.answer_id = entry.manhwa_id
          )
      ))
      from unnest(p_modes) selected(mode)
    ), '{}'::jsonb),
    'combined_eligible_count', (
      select count(distinct entry.manhwa_id)::integer
      from app_private.multiplayer_list_contribution_entries entry
      where entry.room_id = p_room_id
        and exists (
          select 1
          from public.puzzle_pool_entries pool
          where pool.manhwa_id = entry.manhwa_id
            and pool.mode = any (p_modes)
            and app_private.multiplayer_normalize_clue(
              pool.mode, pool.meta
            ) is not null
        )
        and not exists (
          select 1 from public.daily_puzzles daily
          where daily.date_key = public.current_utc_date_key()
            and daily.answer_id = entry.manhwa_id
        )
    )
  );
$$;

-- Readiness no longer depends on the player having their own list.
create or replace function public.multiplayer_set_ready(
  p_room_id uuid,
  p_ready boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_hash text := md5(concat_ws(':', p_room_id, p_ready));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_set_ready', 15);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_set_ready', 15, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'set_ready', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    if exists (
      select 1
      from app_private.multiplayer_members member
      join app_private.multiplayer_rooms room on room.id = member.room_id
      where member.room_id = p_room_id
        and member.user_id = v_uid
        and member.is_active
        and room.status = 'lobby'
        and member.is_ready = coalesce(p_ready, false)
    ) then
      v_response := app_private.multiplayer_mutation_response(
        p_room_id, v_uid
      );
      return app_private.multiplayer_idempotency_put(
        v_uid, 'set_ready', p_idempotency_key, v_hash, v_response
      );
    end if;
    return app_private.multiplayer_set_ready_impl(
      p_room_id, p_ready, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function app_private.multiplayer_start_match_impl(
  p_room_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid;
  v_room app_private.multiplayer_rooms%rowtype;
  v_mode text;
  v_mode_round integer;
  v_round_index integer := 0;
  v_entry public.puzzle_pool_entries%rowtype;
  v_clue jsonb;
  v_answer_label text;
  v_now timestamptz := now();
  v_hash text := md5(coalesce(p_room_id::text, ''));
  v_cached jsonb;
  v_response jsonb;
  v_ids integer[];
  v_used_ids integer[];
  v_picked_ids integer[];
  v_schedule_ids integer[];
  v_schedule_modes text[];
  v_schedule_mode_rounds integer[];
  v_schedule_ready boolean := false;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_start_match', 6);
  v_cached := app_private.multiplayer_idempotency_get(
    v_uid, 'start_match', p_idempotency_key, v_hash
  );
  if v_cached is not null then return v_cached; end if;
  select * into v_room
  from app_private.multiplayer_rooms
  where id = p_room_id
  for update;
  if not found or v_room.host_user_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'host_required';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'room_already_started';
  end if;
  if (
    select count(*) from app_private.multiplayer_members
    where room_id = p_room_id and is_active
  ) not between 2 and v_room.max_players then
    raise exception using errcode = 'P0001', message = 'invalid_member_count';
  end if;
  if exists (
    select 1 from app_private.multiplayer_members
    where room_id = p_room_id and is_active and not is_ready
  ) then
    raise exception using errcode = 'P0001', message = 'players_not_ready';
  end if;
  if v_room.pool_source = 'collaborative_lists' and not exists (
    select 1
    from app_private.multiplayer_list_contributions contribution
    join app_private.multiplayer_members member
      on member.room_id = contribution.room_id
     and member.user_id = contribution.user_id
    where contribution.room_id = p_room_id
      and member.is_active
  ) then
    raise exception using
      errcode = 'P0001', message = 'list_contributors_missing';
  end if;

  perform public.ensure_daily_puzzles(public.current_utc_date_key());

  foreach v_mode in array v_room.selected_modes loop
    if v_room.pool_source = 'collaborative_lists' then
      select array_agg(candidate.manhwa_id)
      into v_ids
      from (
        select distinct entry.manhwa_id
        from app_private.multiplayer_list_contribution_entries entry
        where entry.room_id = p_room_id
          and exists (
            select 1 from public.puzzle_pool_entries pool
            where pool.manhwa_id = entry.manhwa_id
              and pool.mode = v_mode
              and app_private.multiplayer_normalize_clue(
                v_mode, pool.meta
              ) is not null
          )
          and not exists (
            select 1 from public.daily_puzzles daily
            where daily.date_key = public.current_utc_date_key()
              and daily.answer_id = entry.manhwa_id
          )
      ) candidate;
    else
      select array_agg(candidate.manhwa_id)
      into v_ids
      from (
        select distinct pool.manhwa_id
        from public.puzzle_pool_entries pool
        where pool.mode = v_mode
          and pool.taste = v_room.pool_source
          and app_private.multiplayer_normalize_clue(
            v_mode, pool.meta
          ) is not null
          and not exists (
            select 1 from public.daily_puzzles daily
            where daily.date_key = public.current_utc_date_key()
              and daily.answer_id = pool.manhwa_id
          )
      ) candidate;
    end if;
    if coalesce(cardinality(v_ids), 0) < 3 then
      if v_room.pool_source = 'collaborative_lists' then
        raise exception using errcode = 'P0001',
          message = 'collaborative_mode_pool_insufficient:' || v_mode;
      end if;
      raise exception using errcode = 'P0001',
        message = 'selected_mode_pool_unavailable:' || v_mode;
    end if;
  end loop;

  <<allocation_attempt>>
  for v_attempt in 1..32 loop
    v_used_ids := '{}'::integer[];
    v_schedule_ids := '{}'::integer[];
    v_schedule_modes := '{}'::text[];
    v_schedule_mode_rounds := '{}'::integer[];
    foreach v_mode in array v_room.selected_modes loop
      if v_room.pool_source = 'collaborative_lists' then
        select array_agg(randomized.manhwa_id)
        into v_picked_ids
        from (
          select candidate.manhwa_id
          from (
            select distinct entry.manhwa_id
            from app_private.multiplayer_list_contribution_entries entry
            where entry.room_id = p_room_id
              and not (entry.manhwa_id = any(v_used_ids))
              and exists (
                select 1 from public.puzzle_pool_entries pool
                where pool.manhwa_id = entry.manhwa_id
                  and pool.mode = v_mode
                  and app_private.multiplayer_normalize_clue(
                    v_mode, pool.meta
                  ) is not null
              )
              and not exists (
                select 1 from public.daily_puzzles daily
                where daily.date_key = public.current_utc_date_key()
                  and daily.answer_id = entry.manhwa_id
              )
          ) candidate
          order by random()
          limit 3
        ) randomized;
      else
        select array_agg(randomized.manhwa_id)
        into v_picked_ids
        from (
          select candidate.manhwa_id
          from (
            select distinct pool.manhwa_id
            from public.puzzle_pool_entries pool
            where pool.mode = v_mode
              and pool.taste = v_room.pool_source
              and not (pool.manhwa_id = any(v_used_ids))
              and app_private.multiplayer_normalize_clue(
                v_mode, pool.meta
              ) is not null
              and not exists (
                select 1 from public.daily_puzzles daily
                where daily.date_key = public.current_utc_date_key()
                  and daily.answer_id = pool.manhwa_id
              )
          ) candidate
          order by random()
          limit 3
        ) randomized;
      end if;
      if coalesce(cardinality(v_picked_ids), 0) <> 3 then
        continue allocation_attempt;
      end if;
      v_used_ids := v_used_ids || v_picked_ids;
      for v_pick_round in 1..3 loop
        v_schedule_ids := array_append(
          v_schedule_ids, v_picked_ids[v_pick_round]
        );
        v_schedule_modes := array_append(v_schedule_modes, v_mode);
        v_schedule_mode_rounds := array_append(
          v_schedule_mode_rounds, v_pick_round
        );
      end loop;
    end loop;
    v_schedule_ready := true;
    exit;
  end loop allocation_attempt;

  if not v_schedule_ready then
    raise exception using errcode = 'P0001',
      message = case
        when v_room.pool_source = 'collaborative_lists'
          then 'collaborative_schedule_unavailable'
        else 'selected_mode_pool_unavailable:combined'
      end;
  end if;

  for v_index in 1..cardinality(v_schedule_ids) loop
    v_mode := v_schedule_modes[v_index];
    v_mode_round := v_schedule_mode_rounds[v_index];
    if v_room.pool_source = 'collaborative_lists' then
      select pool.* into v_entry
      from public.puzzle_pool_entries pool
      where pool.manhwa_id = v_schedule_ids[v_index]
        and pool.mode = v_mode
        and app_private.multiplayer_normalize_clue(
          v_mode, pool.meta
        ) is not null
      order by case pool.taste
        when 'both' then 0
        when 'action' then 1
        else 2
      end
      limit 1;
    else
      select pool.* into v_entry
      from public.puzzle_pool_entries pool
      where pool.manhwa_id = v_schedule_ids[v_index]
        and pool.mode = v_mode
        and pool.taste = v_room.pool_source
        and app_private.multiplayer_normalize_clue(
          v_mode, pool.meta
        ) is not null
      limit 1;
    end if;
    if not found then
      raise exception using errcode = 'P0001',
        message = 'puzzle_unavailable';
    end if;
    v_clue := app_private.multiplayer_normalize_clue(v_mode, v_entry.meta);
    v_answer_label := coalesce(
      nullif(v_entry.meta ->> 'answer_label', ''),
      nullif(v_entry.meta ->> 'title', ''),
      '#' || v_entry.manhwa_id::text
    );
    insert into app_private.multiplayer_rounds (
      room_id, round_index, mode, mode_round, status,
      answer_id, answer_label, clue, answer_fingerprint
    ) values (
      p_room_id, v_round_index, v_mode, v_mode_round,
      case when v_round_index = 0 then 'countdown' else 'pending' end,
      v_entry.manhwa_id, v_answer_label, v_clue,
      coalesce(v_entry.meta -> 'answer_fingerprint', '{}'::jsonb)
    );
    v_round_index := v_round_index + 1;
  end loop;

  update app_private.multiplayer_rooms
  set status = 'countdown',
      current_round_index = 0,
      phase_ends_at = v_now + interval '3 seconds',
      started_at = v_now,
      expires_at = v_now + interval '6 hours',
      version = version + 1,
      updated_at = v_now
  where id = p_room_id;
  v_response := app_private.multiplayer_mutation_response(p_room_id, v_uid);
  return app_private.multiplayer_idempotency_put(
    v_uid, 'start_match', p_idempotency_key, v_hash, v_response
  );
end;
$$;

revoke all on function app_private.multiplayer_pool_summary(uuid, text[])
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_start_match_impl(uuid, text)
  from public, anon, authenticated;
revoke all on function public.multiplayer_set_ready(uuid, boolean, text)
  from public, anon;
grant execute on function public.multiplayer_set_ready(uuid, boolean, text)
  to authenticated, service_role;
