-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.versus_normalize_mode_rounds(p_mode_rounds jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_mode text;
  v_rounds integer;
  v_total integer := 0;
begin
  if p_mode_rounds is null or jsonb_typeof(p_mode_rounds) <> 'object' then
    return null;
  end if;

  foreach v_mode in array array['summary', 'character', 'cover', 'heardle']
  loop
    if p_mode_rounds ? v_mode then
      begin
        v_rounds := (p_mode_rounds ->> v_mode)::integer;
      exception when others then
        return null;
      end;
      if v_rounds is null or v_rounds < 1 or v_rounds > 5 then
        return null;
      end if;
      v_out := v_out || jsonb_build_object(v_mode, v_rounds);
      v_total := v_total + v_rounds;
    end if;
  end loop;

  if v_total < 1 or v_total > 20 then
    return null;
  end if;
  if v_out = '{}'::jsonb then
    return null;
  end if;
  return v_out;
end;
$$;

create or replace function app_private.versus_build_schedule(p_mode_rounds jsonb)
returns text[]
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v_norm jsonb := app_private.versus_normalize_mode_rounds(p_mode_rounds);
  v_mode text;
  v_rounds integer;
  v_schedule text[] := '{}'::text[];
  i integer;
begin
  if v_norm is null then
    return null;
  end if;
  foreach v_mode in array array['summary', 'character', 'cover', 'heardle']
  loop
    if v_norm ? v_mode then
      v_rounds := (v_norm ->> v_mode)::integer;
      for i in 1..v_rounds loop
        v_schedule := array_append(v_schedule, v_mode);
      end loop;
    end if;
  end loop;
  return v_schedule;
end;
$$;

create or replace function app_private.versus_generate_code()
returns text
language plpgsql
volatile
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try integer;
  v_pos integer;
begin
  for v_try in 1..40 loop
    v_code := '';
    for v_pos in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    if not exists (select 1 from public.versus_rooms r where r.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'versus_code_exhausted';
end;
$$;

create or replace function app_private.versus_player_username(p_user_id uuid)
returns text
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select nullif(btrim(pp.username), '')
  from public.public_profiles pp
  where pp.user_id = p_user_id
    and not coalesce(pp.username_change_required, false)
  limit 1;
$$;

create or replace function app_private.versus_is_participant(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1
    from public.versus_players vp
    where vp.room_id = p_room_id
      and vp.user_id = p_user_id
  );
$$;

create or replace function app_private.versus_pick_puzzle(
  p_mode text,
  p_taste text,
  p_exclude_ids integer[]
)
returns table (
  answer_id integer,
  character_id integer,
  puzzle_meta jsonb
)
language plpgsql
volatile
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_today text := public.current_utc_date_key();
  v_exclude integer[] := coalesce(p_exclude_ids, '{}'::integer[]);
  v_daily_id integer;
begin
  select dp.answer_id into v_daily_id
  from public.daily_puzzles dp
  where dp.date_key = v_today
    and dp.mode = p_mode
    and dp.taste = p_taste;

  if v_daily_id is not null then
    v_exclude := array_append(v_exclude, v_daily_id);
  end if;

  return query
  select p.manhwa_id, p.character_id, p.meta
  from public.puzzle_pool_entries p
  where p.mode = p_mode
    and p.taste = p_taste
    and not (p.manhwa_id = any (v_exclude))
    and p.meta ? 'public_clue'
    and p.meta ? 'answer_fingerprint'
  order by random()
  limit 1;
end;
$$;

create or replace function app_private.versus_attempt_public(
  p_attempt app_private.versus_round_attempts,
  p_reveal_guesses boolean
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  select jsonb_build_object(
    'user_id', p_attempt.user_id,
    'status', p_attempt.status,
    'guess_count', p_attempt.guess_count,
    'max_guesses', p_attempt.max_guesses,
    'elapsed_ms', p_attempt.elapsed_ms,
    'round_score', p_attempt.round_score,
    'guess_mult', p_attempt.guess_mult,
    'speed_mult', p_attempt.speed_mult,
    'finalized_at', p_attempt.finalized_at,
    'guess_ids', case
      when p_reveal_guesses then to_jsonb(coalesce(p_attempt.guess_ids, '{}'::integer[]))
      else '[]'::jsonb
    end
  );
$$;

create or replace function app_private.versus_room_snapshot(p_room_id uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_room public.versus_rooms%rowtype;
  v_round app_private.versus_rounds%rowtype;
  v_my app_private.versus_round_attempts%rowtype;
  v_reveal boolean := false;
  v_players jsonb;
  v_attempts jsonb := '[]'::jsonb;
  v_schedule text[];
  v_round_public jsonb := null;
begin
  select * into v_room from public.versus_rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if not app_private.versus_is_participant(p_room_id, p_viewer) then
    return jsonb_build_object('ok', false, 'error', 'not_participant');
  end if;

  v_schedule := app_private.versus_build_schedule(v_room.mode_rounds);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', vp.user_id,
      'slot', vp.slot,
      'ready', vp.ready,
      'total_score', vp.total_score,
      'total_guesses', vp.total_guesses,
      'total_elapsed_ms', vp.total_elapsed_ms,
      'username', vp.username,
      'is_host', vp.user_id = v_room.host_id,
      'is_self', vp.user_id = p_viewer
    )
    order by vp.slot
  ), '[]'::jsonb)
  into v_players
  from public.versus_players vp
  where vp.room_id = p_room_id;

  if v_room.status in ('countdown', 'in_round', 'between_rounds', 'finished') then
    select * into v_round
    from app_private.versus_rounds r
    where r.room_id = p_room_id
      and r.round_index = v_room.current_round_index;

    if found then
      v_reveal := v_round.status = 'complete' or v_room.status in ('between_rounds', 'finished');

      select * into v_my
      from app_private.versus_round_attempts a
      where a.round_id = v_round.id
        and a.user_id = p_viewer;

      select coalesce(jsonb_agg(app_private.versus_attempt_public(a, v_reveal) order by a.user_id), '[]'::jsonb)
      into v_attempts
      from app_private.versus_round_attempts a
      where a.round_id = v_round.id;

      v_round_public := jsonb_build_object(
        'round_index', v_round.round_index,
        'mode', v_round.mode,
        'status', v_round.status,
        'play_starts_at', v_round.play_starts_at,
        'ends_at', v_round.ends_at,
        'meta', app_private.daily_play_public_meta(v_round.puzzle_meta),
        'answer_id', case
          when v_reveal or (v_my.id is not null and v_my.status is distinct from 'active')
            then v_round.answer_id
          else null
        end,
        'character_id', case
          when v_reveal or (v_my.id is not null and v_my.status is distinct from 'active')
            then v_round.character_id
          else null
        end,
        'my_attempt', case
          when v_my.id is null then null
          else app_private.versus_attempt_public(v_my, true)
        end,
        'attempts', v_attempts
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'host_id', v_room.host_id,
      'status', v_room.status,
      'mode_rounds', v_room.mode_rounds,
      'taste', v_room.taste,
      'current_round_index', v_room.current_round_index,
      'round_count', coalesce(cardinality(v_schedule), 0),
      'schedule', to_jsonb(coalesce(v_schedule, '{}'::text[])),
      'winner_user_id', v_room.winner_user_id,
      'created_at', v_room.created_at,
      'started_at', v_room.started_at,
      'finished_at', v_room.finished_at,
      'expires_at', v_room.expires_at
    ),
    'players', v_players,
    'round', v_round_public
  );
end;
$$;

revoke all on function app_private.versus_normalize_mode_rounds(jsonb) from public, anon, authenticated;
revoke all on function app_private.versus_build_schedule(jsonb) from public, anon, authenticated;
revoke all on function app_private.versus_generate_code() from public, anon, authenticated;
revoke all on function app_private.versus_player_username(uuid) from public, anon, authenticated;
revoke all on function app_private.versus_is_participant(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.versus_pick_puzzle(text, text, integer[]) from public, anon, authenticated;
revoke all on function app_private.versus_attempt_public(app_private.versus_round_attempts, boolean)
  from public, anon, authenticated;
revoke all on function app_private.versus_room_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.versus_normalize_mode_rounds(jsonb) to postgres, service_role;
grant execute on function app_private.versus_build_schedule(jsonb) to postgres, service_role;
grant execute on function app_private.versus_generate_code() to postgres, service_role;
grant execute on function app_private.versus_player_username(uuid) to postgres, service_role;
grant execute on function app_private.versus_is_participant(uuid, uuid) to postgres, service_role;
grant execute on function app_private.versus_pick_puzzle(text, text, integer[]) to postgres, service_role;
grant execute on function app_private.versus_attempt_public(app_private.versus_round_attempts, boolean)
  to postgres, service_role;
grant execute on function app_private.versus_room_snapshot(uuid, uuid) to postgres, service_role;

-- ---------------------------------------------------------------------------