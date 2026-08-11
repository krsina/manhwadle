-- Server-authoritative group multiplayer for 2-8 authenticated players.
-- Exactly three rounds are generated for every selected mode in fixed
-- summary -> character -> cover -> heardle order.

create schema if not exists app_private;

create table if not exists app_private.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  taste text not null
    check (taste = any (array['action'::text, 'romance'::text, 'both'::text])),
  selected_modes text[] not null,
  rounds_per_mode smallint not null default 3 check (rounds_per_mode = 3),
  max_players smallint not null check (max_players between 2 and 8),
  status text not null default 'lobby'
    check (status = any (array[
      'lobby'::text, 'countdown'::text, 'active'::text,
      'intermission'::text, 'completed'::text, 'cancelled'::text,
      'expired'::text
    ])),
  current_round_index integer,
  phase_ends_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
    default (now() + interval '6 hours'),
  updated_at timestamptz not null default now(),
  constraint multiplayer_rooms_modes_check check (
    cardinality(selected_modes) between 1 and 4
    and array_position(selected_modes, null) is null
    and selected_modes <@ array[
      'summary'::text, 'character'::text, 'cover'::text, 'heardle'::text
    ]
  ),
  constraint multiplayer_rooms_round_index_check check (
    current_round_index is null
    or current_round_index between 0 and 11
  )
);

create table if not exists app_private.multiplayer_members (
  room_id uuid not null references app_private.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat smallint not null check (seat between 1 and 8),
  is_ready boolean not null default false,
  is_active boolean not null default true,
  total_score integer not null default 0 check (total_score >= 0),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- This table is the concurrency-safe lease for one nonterminal room per user.
-- It is deliberately separate from member.is_active: terminal match rosters
-- remain intact while their users are free to create or join another room.
create table if not exists app_private.multiplayer_active_occupancy (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id uuid not null references app_private.multiplayer_rooms (id) on delete cascade,
  seat smallint not null check (seat between 1 and 8),
  occupied_at timestamptz not null default now(),
  unique (room_id, seat)
);

create table if not exists app_private.multiplayer_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references app_private.multiplayer_rooms (id) on delete cascade,
  round_index integer not null check (round_index between 0 and 11),
  mode text not null
    check (mode = any (array[
      'summary'::text, 'character'::text, 'cover'::text, 'heardle'::text
    ])),
  mode_round smallint not null check (mode_round between 1 and 3),
  status text not null default 'pending'
    check (status = any (array[
      'pending'::text, 'countdown'::text, 'active'::text,
      'completed'::text, 'cancelled'::text
    ])),
  answer_id integer not null,
  answer_label text not null,
  clue jsonb not null,
  answer_fingerprint jsonb,
  max_guesses smallint not null default 6 check (max_guesses = 6),
  starts_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  unique (room_id, round_index),
  unique (room_id, mode, mode_round)
);

create table if not exists app_private.multiplayer_attempts (
  round_id uuid not null references app_private.multiplayer_rounds (id) on delete cascade,
  room_id uuid not null references app_private.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status = any (array[
      'active'::text, 'won'::text, 'lost'::text,
      'surrendered'::text, 'timed_out'::text
    ])),
  guess_count smallint not null default 0 check (guess_count between 0 and 6),
  guess_ids integer[] not null default '{}'::integer[],
  feedback jsonb not null default '[]'::jsonb,
  score integer not null default 0 check (score >= 0),
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, user_id),
  foreign key (room_id, user_id)
    references app_private.multiplayer_members (room_id, user_id)
    on delete cascade,
  constraint multiplayer_attempt_guess_count_check
    check (cardinality(guess_ids) = guess_count),
  constraint multiplayer_attempt_feedback_check
    check (jsonb_typeof(feedback) = 'array')
);

create table if not exists app_private.multiplayer_idempotency (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null,
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation, idempotency_key)
);

create index if not exists multiplayer_rooms_expiry_idx
  on app_private.multiplayer_rooms (expires_at);
create index if not exists multiplayer_members_user_idx
  on app_private.multiplayer_members (user_id, joined_at desc);
create index if not exists multiplayer_rounds_room_status_idx
  on app_private.multiplayer_rounds (room_id, status, round_index);
create index if not exists multiplayer_attempts_room_round_idx
  on app_private.multiplayer_attempts (room_id, round_id, status);
create index if not exists multiplayer_idempotency_created_idx
  on app_private.multiplayer_idempotency (created_at);

alter table app_private.multiplayer_rooms enable row level security;
alter table app_private.multiplayer_members enable row level security;
alter table app_private.multiplayer_active_occupancy enable row level security;
alter table app_private.multiplayer_rounds enable row level security;
alter table app_private.multiplayer_attempts enable row level security;
alter table app_private.multiplayer_idempotency enable row level security;

revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to authenticated;
revoke all on table app_private.multiplayer_rooms from public, anon, authenticated;
revoke all on table app_private.multiplayer_members from public, anon, authenticated;
revoke all on table app_private.multiplayer_active_occupancy from public, anon, authenticated;
revoke all on table app_private.multiplayer_rounds from public, anon, authenticated;
revoke all on table app_private.multiplayer_attempts from public, anon, authenticated;
revoke all on table app_private.multiplayer_idempotency from public, anon, authenticated;
grant all on table app_private.multiplayer_rooms to postgres, service_role;
grant all on table app_private.multiplayer_members to postgres, service_role;
grant all on table app_private.multiplayer_active_occupancy to postgres, service_role;
grant all on table app_private.multiplayer_rounds to postgres, service_role;
grant all on table app_private.multiplayer_attempts to postgres, service_role;
grant all on table app_private.multiplayer_idempotency to postgres, service_role;

create or replace function app_private.multiplayer_normalize_modes(p_modes text[])
returns text[]
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select case
    when p_modes is null
      or cardinality(p_modes) not between 1 and 4
      or array_position(p_modes, null) is not null
      or exists (
        select 1 from unnest(p_modes) as selected(mode)
        where selected.mode not in ('summary', 'character', 'cover', 'heardle')
      )
      or cardinality(p_modes) <> cardinality(array(select distinct unnest(p_modes)))
    then null
    else array(
      select mode
      from unnest(array['summary', 'character', 'cover', 'heardle']) with ordinality fixed(mode, ordinal)
      where mode = any (p_modes)
      order by ordinal
    )
  end;
$$;

create or replace function app_private.multiplayer_normalize_clue(
  p_mode text,
  p_meta jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_clue jsonb;
begin
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then return null; end if;
  if p_mode in ('summary', 'cover') then
    v_clue := p_meta -> 'public_clue';
  elsif p_mode = 'character'
        and jsonb_typeof(p_meta -> 'character_clues') = 'array'
        and jsonb_array_length(p_meta -> 'character_clues') > 0 then
    select value - 'character_id' into v_clue
    from jsonb_array_elements(p_meta -> 'character_clues')
    order by random() limit 1;
    v_clue := jsonb_build_object('type', 'character') || coalesce(v_clue, '{}'::jsonb);
  elsif p_mode = 'heardle'
        and jsonb_typeof(p_meta -> 'heardle_clues') = 'array'
        and jsonb_array_length(p_meta -> 'heardle_clues') > 0 then
    select value into v_clue
    from jsonb_array_elements(p_meta -> 'heardle_clues')
    order by random() limit 1;
    v_clue := jsonb_build_object('type', 'heardle') || coalesce(v_clue, '{}'::jsonb);
  end if;
  if v_clue is null or jsonb_typeof(v_clue) <> 'object' then return null; end if;
  v_clue := v_clue
    - 'answer_id' - 'manhwa_id' - 'character_id'
    - 'answer_fingerprint' - 'fingerprint'
    - 'eligible_character_ids' - 'bonus_name_normalized' - 'bonus_name_aliases';
  return case when v_clue = '{}'::jsonb then null else v_clue end;
end;
$$;

create or replace function app_private.multiplayer_require_actor(
  p_rpc_name text,
  p_max_calls integer
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if app_private.is_cloud_banned(v_uid) then
    raise exception using errcode = 'P0001', message = 'cloud_banned';
  end if;
  if not exists (
    select 1
    from public.public_profiles profile
    where profile.user_id = v_uid
      and nullif(btrim(profile.username), '') is not null
  ) then
    raise exception using errcode = 'P0001', message = 'username_required';
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, p_rpc_name, p_max_calls, 60) then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  return v_uid;
end;
$$;

create or replace function app_private.multiplayer_idempotency_get(
  p_user_id uuid,
  p_operation text,
  p_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_row app_private.multiplayer_idempotency%rowtype;
begin
  if p_key is null or char_length(p_key) not between 8 and 128 then
    raise exception using errcode = 'P0001', message = 'invalid_idempotency_key';
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_operation), hashtext(p_key)
  );
  select * into v_row from app_private.multiplayer_idempotency
  where user_id = p_user_id and operation = p_operation and idempotency_key = p_key;
  if not found then return null; end if;
  if v_row.request_hash <> p_request_hash then
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  return v_row.response;
end;
$$;

create or replace function app_private.multiplayer_idempotency_put(
  p_user_id uuid,
  p_operation text,
  p_key text,
  p_request_hash text,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  insert into app_private.multiplayer_idempotency (
    user_id, operation, idempotency_key, request_hash, response
  ) values (p_user_id, p_operation, p_key, p_request_hash, p_response)
  on conflict (user_id, operation, idempotency_key) do nothing;
  return p_response;
end;
$$;

create or replace function app_private.multiplayer_feedback_row(
  p_guess_id integer,
  p_target_fingerprint jsonb,
  p_guess_fingerprint jsonb,
  p_correct boolean
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
declare
  v_target_genres text[] := array(
    select jsonb_array_elements_text(coalesce(p_target_fingerprint -> 'genres', '[]'::jsonb))
  );
  v_guess_genres text[] := array(
    select jsonb_array_elements_text(coalesce(p_guess_fingerprint -> 'genres', '[]'::jsonb))
  );
  v_target_tags text[] := array(
    select jsonb_array_elements_text(coalesce(p_target_fingerprint -> 'tags', '[]'::jsonb))
  );
  v_guess_tags text[] := array(
    select jsonb_array_elements_text(coalesce(p_guess_fingerprint -> 'tags', '[]'::jsonb))
  );
  v_shared_genres text[];
  v_shared_tags text[];
  v_target_year integer;
  v_guess_year integer;
begin
  select coalesce(array_agg(value order by value), '{}'::text[]) into v_shared_genres
  from (select unnest(v_target_genres) intersect select unnest(v_guess_genres)) shared(value);
  select coalesce(array_agg(value order by value), '{}'::text[]) into v_shared_tags
  from (select unnest(v_target_tags) intersect select unnest(v_guess_tags)) shared(value);
  v_target_year := nullif(p_target_fingerprint ->> 'year', '')::integer;
  v_guess_year := nullif(p_guess_fingerprint ->> 'year', '')::integer;
  return jsonb_build_object(
    'guess_id', p_guess_id,
    'is_correct', p_correct,
    'display_label', coalesce(p_guess_fingerprint ->> 'answer_label', '#' || p_guess_id::text),
    'genres', jsonb_build_object(
      'tone', case
        when v_guess_genres = v_target_genres then 'correct'
        when cardinality(v_shared_genres) > 0 then 'close' else 'incorrect' end,
      'shared', to_jsonb(v_shared_genres)
    ),
    'year', jsonb_build_object(
      'tone', case
        when v_guess_year is not null and v_guess_year = v_target_year then 'correct'
        when v_guess_year is not null and v_target_year is not null
          and abs(v_guess_year - v_target_year) <= 2 then 'close'
        else 'incorrect' end,
      'direction', case
        when v_guess_year is null or v_target_year is null then 'unknown'
        when v_guess_year = v_target_year then 'exact'
        when v_guess_year < v_target_year then 'up' else 'down' end
    ),
    'status', jsonb_build_object(
      'tone', case when coalesce(p_guess_fingerprint ->> 'status', '') =
        coalesce(p_target_fingerprint ->> 'status', '') then 'correct' else 'incorrect' end
    ),
    'publisher', jsonb_build_object(
      'tone', case when coalesce(p_guess_fingerprint ->> 'publisher', '') =
        coalesce(p_target_fingerprint ->> 'publisher', '') then 'correct' else 'incorrect' end
    ),
    'tags', jsonb_build_object(
      'tone', case
        when v_guess_tags = v_target_tags then 'correct'
        when cardinality(v_shared_tags) > 0 then 'close' else 'incorrect' end,
      'shared', to_jsonb(v_shared_tags)
    )
  );
end;
$$;

create or replace function app_private.multiplayer_state(
  p_room_id uuid,
  p_viewer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_room app_private.multiplayer_rooms%rowtype;
  v_members jsonb;
  v_rounds jsonb;
  v_attempts jsonb;
  v_member_count integer;
begin
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id;
  if not found or not exists (
    select 1 from app_private.multiplayer_members
    where room_id = p_room_id and user_id = p_viewer_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select count(*)::integer into v_member_count
  from app_private.multiplayer_members where room_id = p_room_id and is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', ranked.user_id,
    'username', coalesce(ranked.username, 'Player'),
    'avatar_id', ranked.avatar_id,
    'stage_id', ranked.stage_id,
    'is_host', ranked.user_id = v_room.host_user_id,
    'is_ready', ranked.is_ready,
    'is_active', ranked.is_active,
    'has_surrendered', ranked.has_surrendered,
    'score', ranked.total_score,
    'rank', ranked.rank,
    'joined_at', ranked.joined_at
  ) order by ranked.joined_at, ranked.user_id), '[]'::jsonb)
  into v_members
  from (
    select
      m.*,
      pp.username,
      uap.equipped_item_id as avatar_id,
      uap.equipped_stage_id as stage_id,
      exists (
        select 1 from app_private.multiplayer_attempts a
        join app_private.multiplayer_rounds r on r.id = a.round_id
        where a.user_id = m.user_id and a.room_id = m.room_id
          and r.round_index = v_room.current_round_index
          and a.status = 'surrendered'
      ) as has_surrendered,
      case when v_room.status in ('completed', 'cancelled', 'expired')
        then rank() over (order by m.total_score desc)
        else null end as rank
    from app_private.multiplayer_members m
    left join public.public_profiles pp on pp.user_id = m.user_id
    left join public.user_avatar_profiles uap on uap.user_id = m.user_id
    where m.room_id = p_room_id
  ) ranked;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'index', r.round_index,
    'mode', r.mode,
    'mode_round', r.mode_round,
    'status', r.status,
    'clue', case when r.status in ('active', 'completed') then r.clue else null end,
    'answer_id', case when r.status in ('completed', 'cancelled') then r.answer_id else null end,
    'answer_label', case when r.status in ('completed', 'cancelled') then r.answer_label else null end,
    'max_guesses', r.max_guesses,
    'starts_at', r.starts_at,
    'ends_at', r.ends_at,
    'completed_at', r.completed_at
  ) order by r.round_index), '[]'::jsonb)
  into v_rounds
  from app_private.multiplayer_rounds r where r.room_id = p_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', a.round_id,
    'user_id', a.user_id,
    'status', a.status,
    'guess_count', a.guess_count,
    'guess_ids', case
      when a.user_id = p_viewer_id or r.status in ('completed', 'cancelled')
        then to_jsonb(a.guess_ids)
      else null
    end,
    'feedback', case
      when a.user_id = p_viewer_id or r.status in ('completed', 'cancelled')
        then a.feedback
      else null
    end,
    'score', a.score,
    'elapsed_ms', a.elapsed_ms,
    'finalized_at', a.finalized_at,
    'is_viewer', a.user_id = p_viewer_id
  ) order by r.round_index, a.user_id), '[]'::jsonb)
  into v_attempts
  from app_private.multiplayer_attempts a
  join app_private.multiplayer_rounds r on r.id = a.round_id
  where a.room_id = p_room_id;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'host_user_id', v_room.host_user_id,
      'status', v_room.status,
      'selected_modes', to_jsonb(v_room.selected_modes),
      'rounds_per_mode', v_room.rounds_per_mode,
      'max_players', v_room.max_players,
      'member_count', v_member_count,
      'current_round_index', v_room.current_round_index,
      'taste', v_room.taste,
      'created_at', v_room.created_at,
      'started_at', v_room.started_at,
      'completed_at', v_room.completed_at,
      'expires_at', v_room.expires_at,
      'phase_ends_at', v_room.phase_ends_at
    ),
    'members', v_members,
    'rounds', v_rounds,
    'attempts', v_attempts,
    -- Use timestamptz `now()` so JSON includes an offset; timestamp-without-tz
    -- serializes as a naive ISO string and browsers parse it as local time.
    'server_now', now(),
    'version', v_room.version
  );
end;
$$;

create or replace function app_private.multiplayer_start_round_locked(
  p_room_id uuid,
  p_round_index integer,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_round_id uuid;
begin
  update app_private.multiplayer_rounds
  set status = 'active', starts_at = p_now, ends_at = p_now + interval '180 seconds'
  where room_id = p_room_id and round_index = p_round_index
  returning id into v_round_id;
  insert into app_private.multiplayer_attempts (round_id, room_id, user_id)
  select v_round_id, p_room_id, m.user_id
  from app_private.multiplayer_members m
  where m.room_id = p_room_id and m.is_active
  on conflict (round_id, user_id) do nothing;
  update app_private.multiplayer_rooms
  set status = 'active',
      current_round_index = p_round_index,
      phase_ends_at = p_now + interval '180 seconds',
      version = version + 1,
      updated_at = p_now
  where id = p_room_id;
end;
$$;

create or replace function app_private.multiplayer_advance_locked(
  p_room_id uuid,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_room app_private.multiplayer_rooms%rowtype;
  v_round app_private.multiplayer_rounds%rowtype;
  v_last_index integer;
begin
  select * into v_room from app_private.multiplayer_rooms
  where id = p_room_id for update;
  if not found then return; end if;

  if v_room.status = 'countdown' and p_now >= v_room.phase_ends_at then
    perform app_private.multiplayer_start_round_locked(p_room_id, 0, p_now);
    return;
  end if;

  if v_room.status = 'intermission' and p_now >= v_room.phase_ends_at then
    perform app_private.multiplayer_start_round_locked(
      p_room_id, v_room.current_round_index + 1, p_now
    );
    return;
  end if;

  if v_room.status <> 'active' then return; end if;
  select * into v_round from app_private.multiplayer_rounds
  where room_id = p_room_id and round_index = v_room.current_round_index for update;

  if p_now < v_room.phase_ends_at and exists (
    select 1
    from app_private.multiplayer_attempts a
    join app_private.multiplayer_members m
      on m.room_id = a.room_id and m.user_id = a.user_id
    where a.round_id = v_round.id and a.status = 'active' and m.is_active
  ) then return; end if;

  update app_private.multiplayer_attempts
  set status = 'timed_out',
      elapsed_ms = greatest(0, (extract(epoch from (p_now - v_round.starts_at)) * 1000)::integer),
      finalized_at = p_now,
      updated_at = p_now
  where round_id = v_round.id and status = 'active';
  update app_private.multiplayer_rounds
  set status = 'completed', completed_at = p_now
  where id = v_round.id;
  select max(round_index) into v_last_index
  from app_private.multiplayer_rounds where room_id = p_room_id;

  if v_room.current_round_index = v_last_index then
    update app_private.multiplayer_rooms
    set status = 'completed',
        phase_ends_at = null,
        completed_at = p_now,
        expires_at = p_now + interval '30 days',
        version = version + 1,
        updated_at = p_now
    where id = p_room_id;
    delete from app_private.multiplayer_active_occupancy
    where room_id = p_room_id;
  else
    update app_private.multiplayer_rooms
    set status = 'intermission',
        phase_ends_at = p_now + interval '7 seconds',
        version = version + 1,
        updated_at = p_now
    where id = p_room_id;
  end if;
end;
$$;

create or replace function app_private.multiplayer_mutation_response(
  p_room_id uuid,
  p_user_id uuid,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select jsonb_build_object(
    'ok', true,
    'state', app_private.multiplayer_state(p_room_id, p_user_id)
  ) || coalesce(p_extra, '{}'::jsonb);
$$;

create or replace function app_private.multiplayer_broadcast_invalidation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'realtime'
as $$
begin
  perform realtime.send(
    jsonb_build_object('room_id', new.id, 'version', new.version),
    'state_invalidated',
    'multiplayer:' || new.id::text,
    true
  );
  return null;
end;
$$;

drop trigger if exists multiplayer_rooms_broadcast on app_private.multiplayer_rooms;
create trigger multiplayer_rooms_broadcast
  after insert or update of version on app_private.multiplayer_rooms
  for each row execute function app_private.multiplayer_broadcast_invalidation();

create or replace function app_private.multiplayer_can_access_topic(
  p_user_id uuid,
  p_topic text
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select p_user_id is not null
    and exists (
      select 1
      from app_private.multiplayer_members m
      join app_private.multiplayer_rooms r on r.id = m.room_id
      where m.user_id = p_user_id and m.is_active
        and p_topic = 'multiplayer:' || r.id::text
        and r.status not in ('cancelled', 'expired')
    );
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null
     and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists multiplayer_members_receive_broadcast on realtime.messages';
    execute $policy$
      create policy multiplayer_members_receive_broadcast
      on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and app_private.multiplayer_can_access_topic(
          (select auth.uid()), (select realtime.topic())
        )
      )
    $policy$;
  end if;
end;
$$;

create or replace function public.multiplayer_create_room(
  p_selected_modes text[],
  p_max_players integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid;
  v_modes text[];
  v_taste text;
  v_code text;
  v_room_id uuid;
  v_hash text := md5(coalesce(p_selected_modes::text, '') || ':' || coalesce(p_max_players::text, ''));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_create_room', 6);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'create_room', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  perform pg_advisory_xact_lock(
    hashtext(v_uid::text), hashtext('multiplayer_active_room')
  );
  if exists (
    select 1 from app_private.multiplayer_active_occupancy
    where user_id = v_uid
  ) then
    raise exception using errcode = 'P0001', message = 'active_room_exists';
  end if;
  v_modes := app_private.multiplayer_normalize_modes(p_selected_modes);
  if v_modes is null then
    raise exception using errcode = 'P0001', message = 'invalid_selected_modes';
  end if;
  if p_max_players not between 2 and 8 then
    raise exception using errcode = 'P0001', message = 'invalid_max_players';
  end if;
  select coalesce(us.reader_taste, 'both') into v_taste
  from public.user_settings us where us.user_id = v_uid;
  v_taste := coalesce(v_taste, 'both');
  loop
    v_code := translate(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), '01', '23');
    exit when not exists (select 1 from app_private.multiplayer_rooms where code = v_code);
  end loop;
  insert into app_private.multiplayer_rooms (
    code, host_user_id, taste, selected_modes, max_players
  ) values (v_code, v_uid, v_taste, v_modes, p_max_players)
  returning id into v_room_id;
  insert into app_private.multiplayer_members (room_id, user_id, seat, is_ready)
  values (v_room_id, v_uid, 1, false);
  insert into app_private.multiplayer_active_occupancy (user_id, room_id, seat)
  values (v_uid, v_room_id, 1);
  v_response := app_private.multiplayer_mutation_response(
    v_room_id, v_uid, jsonb_build_object('created', true)
  );
  return app_private.multiplayer_idempotency_put(
    v_uid, 'create_room', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_join_room(
  p_code text,
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
  v_occupied_room_id uuid;
  v_seat smallint;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_hash text := md5(upper(trim(coalesce(p_code, ''))));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_join_room', 12);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'join_room', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  perform pg_advisory_xact_lock(
    hashtext(v_uid::text), hashtext('multiplayer_active_room')
  );
  select * into v_room from app_private.multiplayer_rooms where code = v_code for update;
  if not found or v_room.status <> 'lobby' or v_room.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'room_not_joinable';
  end if;
  select room_id, seat into v_occupied_room_id, v_seat
  from app_private.multiplayer_active_occupancy
  where user_id = v_uid;
  if found and v_occupied_room_id <> v_room.id then
    raise exception using errcode = 'P0001', message = 'active_room_exists';
  end if;
  if not exists (
    select 1 from app_private.multiplayer_members
    where room_id = v_room.id and user_id = v_uid and is_active
  ) and (select count(*) from app_private.multiplayer_members
    where room_id = v_room.id and is_active) >= v_room.max_players then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;
  if v_occupied_room_id is null then
    select candidate into v_seat
    from generate_series(1, v_room.max_players) as seats(candidate)
    where not exists (
      select 1 from app_private.multiplayer_active_occupancy occupied
      where occupied.room_id = v_room.id and occupied.seat = candidate
    )
    order by candidate
    limit 1;
    if v_seat is null then
      raise exception using errcode = 'P0001', message = 'room_full';
    end if;
    insert into app_private.multiplayer_active_occupancy (user_id, room_id, seat)
    values (v_uid, v_room.id, v_seat);
  end if;
  insert into app_private.multiplayer_members (room_id, user_id, seat)
  values (v_room.id, v_uid, v_seat)
  on conflict (room_id, user_id) do update
  set seat = excluded.seat, is_active = true, is_ready = false, left_at = null;
  update app_private.multiplayer_rooms
  set version = version + 1, updated_at = now() where id = v_room.id;
  v_response := app_private.multiplayer_mutation_response(
    v_room.id, v_uid, jsonb_build_object('joined', true)
  );
  return app_private.multiplayer_idempotency_put(
    v_uid, 'join_room', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_update_settings(
  p_room_id uuid,
  p_selected_modes text[],
  p_max_players integer,
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
  v_modes text[];
  v_hash text := md5(concat_ws(':', p_room_id, p_selected_modes::text, p_max_players));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_update_settings', 12);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'update_settings', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  v_modes := app_private.multiplayer_normalize_modes(p_selected_modes);
  if v_modes is null then raise exception using errcode = 'P0001', message = 'invalid_selected_modes'; end if;
  if p_max_players not between 2 and 8 then
    raise exception using errcode = 'P0001', message = 'invalid_max_players';
  end if;
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id for update;
  if not found or v_room.host_user_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'host_required';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'room_already_started';
  end if;
  if p_max_players < (select count(*) from app_private.multiplayer_members
    where room_id = p_room_id and is_active) then
    raise exception using errcode = 'P0001', message = 'max_players_below_member_count';
  end if;
  update app_private.multiplayer_rooms
  set selected_modes = v_modes, max_players = p_max_players,
      version = version + 1, updated_at = now()
  where id = p_room_id;
  update app_private.multiplayer_members
  set is_ready = false where room_id = p_room_id and is_active;
  v_response := app_private.multiplayer_mutation_response(p_room_id, v_uid);
  return app_private.multiplayer_idempotency_put(
    v_uid, 'update_settings', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_set_ready(
  p_room_id uuid,
  p_ready boolean,
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
  v_hash text := md5(concat_ws(':', p_room_id, p_ready));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_set_ready', 30);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'set_ready', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'room_not_in_lobby';
  end if;
  update app_private.multiplayer_members
  set is_ready = coalesce(p_ready, false)
  where room_id = p_room_id and user_id = v_uid and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'not_room_member'; end if;
  update app_private.multiplayer_rooms
  set version = version + 1, updated_at = now() where id = p_room_id;
  v_response := app_private.multiplayer_mutation_response(p_room_id, v_uid);
  return app_private.multiplayer_idempotency_put(
    v_uid, 'set_ready', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_start_match(
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
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_start_match', 6);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'start_match', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id for update;
  if not found or v_room.host_user_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'host_required';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'room_already_started';
  end if;
  if (select count(*) from app_private.multiplayer_members
      where room_id = p_room_id and is_active) not between 2 and v_room.max_players then
    raise exception using errcode = 'P0001', message = 'invalid_member_count';
  end if;
  if exists (select 1 from app_private.multiplayer_members
    where room_id = p_room_id and is_active and not is_ready) then
    raise exception using errcode = 'P0001', message = 'players_not_ready';
  end if;

  perform public.ensure_daily_puzzles(public.current_utc_date_key());
  foreach v_mode in array v_room.selected_modes loop
    for v_mode_round in 1..3 loop
      select p.* into v_entry
      from public.puzzle_pool_entries p
      where p.mode = v_mode and p.taste = v_room.taste
        and app_private.multiplayer_normalize_clue(v_mode, p.meta) is not null
        and not exists (
          select 1 from app_private.multiplayer_rounds used
          where used.room_id = p_room_id and used.answer_id = p.manhwa_id
        )
        and not exists (
          select 1 from public.daily_puzzles daily
          where daily.date_key = public.current_utc_date_key()
            and daily.answer_id = p.manhwa_id
        )
      order by random() limit 1;
      if not found then
        raise exception using errcode = 'P0001', message = 'selected_mode_pool_unavailable:' || v_mode;
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

create or replace function public.multiplayer_get_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_get_state', 120);
  if not exists (
    select 1
    from app_private.multiplayer_members member
    join app_private.multiplayer_rooms room on room.id = member.room_id
    where member.room_id = p_room_id and member.user_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  perform app_private.multiplayer_advance_locked(p_room_id, now());
  return jsonb_build_object(
    'ok', true,
    'state', app_private.multiplayer_state(p_room_id, v_uid)
  );
end;
$$;

create or replace function public.multiplayer_submit_guess(
  p_room_id uuid,
  p_round_id uuid,
  p_guess_id integer,
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
  v_round app_private.multiplayer_rounds%rowtype;
  v_attempt app_private.multiplayer_attempts%rowtype;
  v_guess_fingerprint jsonb := '{}'::jsonb;
  v_feedback jsonb;
  v_correct boolean;
  v_guess_factor numeric;
  v_speed_factor numeric;
  v_score integer := 0;
  v_now timestamptz := now();
  v_hash text := md5(concat_ws(':', p_room_id, p_round_id, p_guess_id));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_submit_guess', 45);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'submit_guess', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  if p_guess_id is null or p_guess_id <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_guess';
  end if;
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id for update;
  perform app_private.multiplayer_advance_locked(p_room_id, v_now);
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id;
  select * into v_round from app_private.multiplayer_rounds
  where id = p_round_id and room_id = p_room_id for update;
  if not found or v_room.status <> 'active' or v_round.status <> 'active'
     or v_round.round_index <> v_room.current_round_index then
    raise exception using errcode = 'P0001', message = 'round_not_active';
  end if;
  select * into v_attempt from app_private.multiplayer_attempts
  where round_id = p_round_id and user_id = v_uid for update;
  if not found or v_attempt.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'attempt_not_active';
  end if;
  select coalesce(p.meta -> 'answer_fingerprint', '{}'::jsonb)
    || jsonb_build_object('answer_label', coalesce(
      nullif(p.meta ->> 'answer_label', ''), nullif(p.meta ->> 'title', ''),
      '#' || p_guess_id::text
    ))
  into v_guess_fingerprint
  from public.puzzle_pool_entries p
  where p.manhwa_id = p_guess_id
  order by (p.taste = v_room.taste) desc, p.position
  limit 1;
  v_guess_fingerprint := coalesce(v_guess_fingerprint, '{}'::jsonb);
  v_correct := p_guess_id = v_round.answer_id;
  v_feedback := app_private.multiplayer_feedback_row(
    p_guess_id, v_round.answer_fingerprint, v_guess_fingerprint, v_correct
  );
  v_attempt.guess_count := v_attempt.guess_count + 1;
  if v_correct then
    v_guess_factor := greatest(1, 7 - v_attempt.guess_count)::numeric / 6;
    v_speed_factor := greatest(0.10, least(
      1.0, extract(epoch from (v_round.ends_at - v_now)) / 180
    ));
    v_score := round(1000 * v_guess_factor * v_speed_factor);
  end if;
  update app_private.multiplayer_attempts
  set guess_count = v_attempt.guess_count,
      guess_ids = array_append(guess_ids, p_guess_id),
      feedback = feedback || jsonb_build_array(v_feedback),
      status = case when v_correct then 'won'
        when v_attempt.guess_count >= v_round.max_guesses then 'lost' else 'active' end,
      score = v_score,
      elapsed_ms = case when v_correct or v_attempt.guess_count >= v_round.max_guesses
        then greatest(0, (extract(epoch from (v_now - v_round.starts_at)) * 1000)::integer)
        else null end,
      finalized_at = case when v_correct or v_attempt.guess_count >= v_round.max_guesses
        then v_now else null end,
      updated_at = v_now
  where round_id = p_round_id and user_id = v_uid;
  if v_correct then
    update app_private.multiplayer_members
    set total_score = total_score + v_score
    where room_id = p_room_id and user_id = v_uid;
  end if;
  update app_private.multiplayer_rooms
  set version = version + 1, updated_at = v_now where id = p_room_id;
  perform app_private.multiplayer_advance_locked(p_room_id, v_now);
  v_response := app_private.multiplayer_mutation_response(
    p_room_id, v_uid, jsonb_build_object(
      'accepted', true, 'correct', v_correct,
      'finalized', v_correct or v_attempt.guess_count >= v_round.max_guesses
    )
  );
  return app_private.multiplayer_idempotency_put(
    v_uid, 'submit_guess', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_surrender(
  p_room_id uuid,
  p_round_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid;
  v_now timestamptz := now();
  v_hash text := md5(concat_ws(':', p_room_id, p_round_id));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_surrender', 12);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'surrender', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  perform 1 from app_private.multiplayer_rooms where id = p_room_id for update;
  perform app_private.multiplayer_advance_locked(p_room_id, v_now);
  update app_private.multiplayer_attempts a
  set status = 'surrendered',
      elapsed_ms = greatest(0, (extract(epoch from (v_now - r.starts_at)) * 1000)::integer),
      finalized_at = v_now,
      updated_at = v_now
  from app_private.multiplayer_rounds r, app_private.multiplayer_rooms room
  where a.round_id = p_round_id and a.user_id = v_uid and a.status = 'active'
    and r.id = a.round_id and room.id = p_room_id and r.room_id = room.id
    and room.status = 'active' and r.status = 'active'
    and r.round_index = room.current_round_index;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_active';
  end if;
  update app_private.multiplayer_rooms
  set version = version + 1, updated_at = v_now where id = p_room_id;
  perform app_private.multiplayer_advance_locked(p_room_id, v_now);
  v_response := app_private.multiplayer_mutation_response(
    p_room_id, v_uid, jsonb_build_object('accepted', true, 'finalized', true)
  );
  return app_private.multiplayer_idempotency_put(
    v_uid, 'surrender', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_leave_room(
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
  v_new_host uuid;
  v_now timestamptz := now();
  v_hash text := md5(coalesce(p_room_id::text, ''));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_leave_room', 12);
  v_cached := app_private.multiplayer_idempotency_get(v_uid, 'leave_room', p_idempotency_key, v_hash);
  if v_cached is not null then return v_cached; end if;
  select * into v_room from app_private.multiplayer_rooms where id = p_room_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'room_not_found'; end if;
  if not exists (
    select 1 from app_private.multiplayer_members
    where room_id = p_room_id and user_id = v_uid
  ) then
    raise exception using errcode = 'P0001', message = 'not_room_member';
  end if;

  -- A lobby host owns the room configuration; leaving cancels the lobby rather
  -- than silently transferring an unstarted match.
  if v_room.status = 'lobby' and v_room.host_user_id = v_uid then
    update app_private.multiplayer_rooms
    set status = 'cancelled', phase_ends_at = null, completed_at = v_now,
        expires_at = v_now + interval '30 days',
        version = version + 1, updated_at = v_now
    where id = p_room_id;
    delete from app_private.multiplayer_active_occupancy
    where room_id = p_room_id;
    v_response := app_private.multiplayer_mutation_response(
      p_room_id, v_uid, jsonb_build_object('accepted', true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'leave_room', p_idempotency_key, v_hash, v_response
    );
  end if;

  if v_room.status in ('completed', 'cancelled', 'expired') then
    v_response := app_private.multiplayer_mutation_response(
      p_room_id, v_uid, jsonb_build_object('accepted', true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'leave_room', p_idempotency_key, v_hash, v_response
    );
  end if;

  if v_room.status = 'lobby' then
    update app_private.multiplayer_members
    set is_active = false, is_ready = false, left_at = v_now
    where room_id = p_room_id and user_id = v_uid and is_active;
    delete from app_private.multiplayer_active_occupancy
    where user_id = v_uid and room_id = p_room_id;
    update app_private.multiplayer_rooms
    set version = version + 1, updated_at = v_now
    where id = p_room_id;
    v_response := app_private.multiplayer_mutation_response(
      p_room_id, v_uid, jsonb_build_object('accepted', true)
    );
    delete from app_private.multiplayer_members
    where room_id = p_room_id and user_id = v_uid;
    return app_private.multiplayer_idempotency_put(
      v_uid, 'leave_room', p_idempotency_key, v_hash, v_response
    );
  end if;

  update app_private.multiplayer_attempts
  set status = 'surrendered', finalized_at = v_now, updated_at = v_now
  where room_id = p_room_id and user_id = v_uid and status = 'active';
  update app_private.multiplayer_members
  set is_active = false, is_ready = false, left_at = v_now
  where room_id = p_room_id and user_id = v_uid and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'not_room_member'; end if;
  delete from app_private.multiplayer_active_occupancy
  where user_id = v_uid and room_id = p_room_id;
  select user_id into v_new_host from app_private.multiplayer_members
  where room_id = p_room_id and is_active order by joined_at, user_id limit 1;
  if v_new_host is null then
    update app_private.multiplayer_rounds
    set status = 'cancelled', completed_at = coalesce(completed_at, v_now)
    where room_id = p_room_id and status in ('pending', 'countdown', 'active');
    update app_private.multiplayer_rooms
    set status = 'cancelled', phase_ends_at = null, completed_at = v_now,
        expires_at = v_now + interval '30 days', version = version + 1, updated_at = v_now
    where id = p_room_id;
    delete from app_private.multiplayer_active_occupancy
    where room_id = p_room_id;
  else
    update app_private.multiplayer_rooms
    set host_user_id = case when host_user_id = v_uid then v_new_host else host_user_id end,
        version = version + 1, updated_at = v_now
    where id = p_room_id;
    perform app_private.multiplayer_advance_locked(p_room_id, v_now);
  end if;
  v_response := app_private.multiplayer_mutation_response(
    p_room_id, v_uid, jsonb_build_object('accepted', true)
  );
  return app_private.multiplayer_idempotency_put(
    v_uid, 'leave_room', p_idempotency_key, v_hash, v_response
  );
end;
$$;

create or replace function public.multiplayer_tick(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_room_id uuid;
  v_now timestamptz := now();
  v_progressed integer := 0;
  v_expired integer := 0;
  v_idempotency_deleted integer := 0;
  v_rooms_deleted integer := 0;
begin
  for v_room_id in
    select id from app_private.multiplayer_rooms
    where status in ('countdown', 'active', 'intermission')
      and phase_ends_at <= v_now
    order by phase_ends_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    perform app_private.multiplayer_advance_locked(v_room_id, v_now);
    v_progressed := v_progressed + 1;
  end loop;
  update app_private.multiplayer_rooms
  set status = 'expired', phase_ends_at = null, completed_at = v_now,
      expires_at = v_now + interval '30 days', version = version + 1, updated_at = v_now
  where status not in ('completed', 'cancelled', 'expired') and expires_at <= v_now;
  get diagnostics v_expired = row_count;
  delete from app_private.multiplayer_active_occupancy occupied
  using app_private.multiplayer_rooms room
  where occupied.room_id = room.id
    and room.status in ('completed', 'cancelled', 'expired');
  delete from app_private.multiplayer_idempotency
  where created_at < v_now - interval '24 hours';
  get diagnostics v_idempotency_deleted = row_count;
  delete from app_private.multiplayer_rooms
  where status in ('completed', 'cancelled', 'expired')
    and completed_at < v_now - interval '30 days';
  get diagnostics v_rooms_deleted = row_count;
  return jsonb_build_object(
    'ok', true, 'progressed', v_progressed, 'expired', v_expired,
    'idempotency_deleted', v_idempotency_deleted, 'rooms_deleted', v_rooms_deleted
  );
end;
$$;

-- Schedule the sweeper only when pg_cron is already installed. The named job
-- is idempotently replaced by pg_cron on rerun.
do $$
begin
  if to_regnamespace('cron') is not null
     and to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute $unschedule$
      select cron.unschedule(jobid)
      from cron.job
      where jobname = 'multiplayer-tick-minute'
    $unschedule$;

    execute $cron$
      select cron.schedule(
        'multiplayer-tick-minute',
        '* * * * *',
        'select public.multiplayer_tick(500);'
      )
    $cron$;
  end if;
exception
  when insufficient_privilege then
    raise warning 'pg_cron is installed but multiplayer_tick could not be scheduled';
end;
$$;

revoke all on function app_private.multiplayer_normalize_modes(text[]) from public, anon, authenticated;
revoke all on function app_private.multiplayer_normalize_clue(text, jsonb) from public, anon, authenticated;
revoke all on function app_private.multiplayer_require_actor(text, integer) from public, anon, authenticated;
revoke all on function app_private.multiplayer_idempotency_get(uuid, text, text, text) from public, anon, authenticated;
revoke all on function app_private.multiplayer_idempotency_put(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.multiplayer_feedback_row(integer, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function app_private.multiplayer_state(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.multiplayer_start_round_locked(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function app_private.multiplayer_advance_locked(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app_private.multiplayer_mutation_response(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.multiplayer_broadcast_invalidation() from public, anon, authenticated;
revoke all on function app_private.multiplayer_can_access_topic(uuid, text) from public, anon;

grant execute on function app_private.multiplayer_normalize_modes(text[]) to postgres, service_role;
grant execute on function app_private.multiplayer_normalize_clue(text, jsonb) to postgres, service_role;
grant execute on function app_private.multiplayer_require_actor(text, integer) to postgres, service_role;
grant execute on function app_private.multiplayer_idempotency_get(uuid, text, text, text) to postgres, service_role;
grant execute on function app_private.multiplayer_idempotency_put(uuid, text, text, text, jsonb) to postgres, service_role;
grant execute on function app_private.multiplayer_feedback_row(integer, jsonb, jsonb, boolean) to postgres, service_role;
grant execute on function app_private.multiplayer_state(uuid, uuid) to postgres, service_role;
grant execute on function app_private.multiplayer_start_round_locked(uuid, integer, timestamptz) to postgres, service_role;
grant execute on function app_private.multiplayer_advance_locked(uuid, timestamptz) to postgres, service_role;
grant execute on function app_private.multiplayer_mutation_response(uuid, uuid, jsonb) to postgres, service_role;
grant execute on function app_private.multiplayer_broadcast_invalidation() to postgres, service_role;
grant execute on function app_private.multiplayer_can_access_topic(uuid, text) to authenticated, service_role;

revoke all on function public.multiplayer_create_room(text[], integer, text) from public, anon;
revoke all on function public.multiplayer_join_room(text, text) from public, anon;
revoke all on function public.multiplayer_update_settings(uuid, text[], integer, text) from public, anon;
revoke all on function public.multiplayer_set_ready(uuid, boolean, text) from public, anon;
revoke all on function public.multiplayer_start_match(uuid, text) from public, anon;
revoke all on function public.multiplayer_get_state(uuid) from public, anon;
revoke all on function public.multiplayer_submit_guess(uuid, uuid, integer, text) from public, anon;
revoke all on function public.multiplayer_surrender(uuid, uuid, text) from public, anon;
revoke all on function public.multiplayer_leave_room(uuid, text) from public, anon;
revoke all on function public.multiplayer_tick(integer) from public, anon, authenticated;

grant execute on function public.multiplayer_create_room(text[], integer, text) to authenticated, service_role;
grant execute on function public.multiplayer_join_room(text, text) to authenticated, service_role;
grant execute on function public.multiplayer_update_settings(uuid, text[], integer, text) to authenticated, service_role;
grant execute on function public.multiplayer_set_ready(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.multiplayer_start_match(uuid, text) to authenticated, service_role;
grant execute on function public.multiplayer_get_state(uuid) to authenticated, service_role;
grant execute on function public.multiplayer_submit_guess(uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.multiplayer_surrender(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.multiplayer_leave_room(uuid, text) to authenticated, service_role;
grant execute on function public.multiplayer_tick(integer) to service_role;

comment on function public.multiplayer_tick(integer) is
  'Service-role phase tick and retention sweeper; schedule at least once per second for timely transitions.';
comment on table app_private.multiplayer_rounds is
  'Private clues, answers and fingerprints. Viewer snapshots omit fingerprints and active answers.';
