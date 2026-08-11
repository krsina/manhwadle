-- Close timezone and deadline races identified during local adversarial review.

create or replace function app_private.consume_rpc_rate_limit(
  p_user_id uuid,
  p_rpc_name text,
  p_max_calls integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_now timestamptz := now();
  v_window_started timestamptz;
  v_count integer;
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  if p_user_id is null
     or p_rpc_name is null
     or btrim(p_rpc_name) = ''
     or p_max_calls is null
     or p_max_calls < 1 then
    return false;
  end if;

  insert into app_private.rpc_rate_windows (
    user_id, rpc_name, window_started_at, call_count
  ) values (
    p_user_id, p_rpc_name, v_now, 1
  )
  on conflict (user_id, rpc_name) do update
  set
    window_started_at = case
      when app_private.rpc_rate_windows.window_started_at <= v_now - v_window
        then v_now
      else app_private.rpc_rate_windows.window_started_at
    end,
    call_count = case
      when app_private.rpc_rate_windows.window_started_at <= v_now - v_window
        then 1
      else app_private.rpc_rate_windows.call_count + 1
    end
  returning window_started_at, call_count
  into v_window_started, v_count;

  return v_count <= p_max_calls;
end;
$$;

create or replace function app_private.multiplayer_require_actor(
  p_rpc_name text,
  p_max_calls integer
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- PostgREST accepts a per-request timezone preference. Pin the transaction
  -- before any legacy multiplayer implementation constructs UTC timestamps.
  perform set_config('TimeZone', 'UTC', true);
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
  return v_uid;
end;
$$;

create or replace function app_private.multiplayer_cooldown_until(
  p_user_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select blocked_until
  from app_private.multiplayer_abuse_state
  where user_id = p_user_id
    and blocked_until > now();
$$;

create or replace function app_private.multiplayer_record_early_abandon(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_state app_private.multiplayer_abuse_state%rowtype;
  v_count integer;
  v_level integer;
begin
  insert into app_private.multiplayer_abuse_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_state
  from app_private.multiplayer_abuse_state
  where user_id = p_user_id
  for update;

  v_level := case
    when v_state.last_penalty_at is null
      or v_state.last_penalty_at <= p_now - interval '24 hours'
      then 0
    else v_state.penalty_level
  end;
  v_count := case
    when v_state.window_started_at <= p_now - interval '30 minutes' then 1
    else v_state.early_abandon_count + 1
  end;

  if v_count >= 3 then
    v_level := least(v_level + 1, 2);
    update app_private.multiplayer_abuse_state
    set window_started_at = p_now,
        early_abandon_count = 0,
        penalty_level = v_level,
        blocked_until = greatest(
          coalesce(blocked_until, p_now),
          p_now + case when v_level = 1
            then interval '15 minutes' else interval '1 hour' end
        ),
        last_penalty_at = p_now,
        updated_at = p_now
    where user_id = p_user_id;
  else
    update app_private.multiplayer_abuse_state
    set window_started_at = case
          when window_started_at <= p_now - interval '30 minutes' then p_now
          else window_started_at
        end,
        early_abandon_count = v_count,
        penalty_level = v_level,
        updated_at = p_now
    where user_id = p_user_id;
  end if;
end;
$$;

create or replace function app_private.multiplayer_room_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'extensions'
as $$
declare
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_index integer;
begin
  if tg_op = 'INSERT' then
    loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := '';
      for v_index in 0..7 loop
        v_code := v_code || substr(
          v_alphabet,
          (get_byte(v_bytes, v_index) % 32) + 1,
          1
        );
      end loop;
      exit when not exists (
        select 1 from app_private.multiplayer_rooms room
        where room.code = v_code
      );
    end loop;
    new.code := v_code;
    if new.status = 'lobby' then
      new.expires_at := now() + interval '2 hours';
    end if;
  end if;

  if new.status is distinct from (
    case when tg_op = 'UPDATE' then old.status else null end
  ) then
    if new.status = 'completed' then
      new.expires_at := now() + interval '15 minutes';
    elsif new.status in ('cancelled', 'expired') then
      new.expires_at := now() + interval '5 minutes';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app_private.multiplayer_early_abandon_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  if old.status not in ('completed', 'cancelled', 'expired')
     and new.status = 'cancelled'
     and old.started_at is not null
     and not exists (
       select 1
       from app_private.multiplayer_rounds round
       where round.room_id = new.id
         and round.round_index = 0
         and round.status = 'completed'
     ) then
    perform app_private.multiplayer_record_early_abandon(
      old.host_user_id,
      now()
    );
  end if;
  return null;
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
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('multiplayer_idempotency_trim')
  );
  delete from app_private.multiplayer_idempotency
  where user_id = p_user_id
    and created_at < now() - interval '1 hour';
  delete from app_private.multiplayer_idempotency
  where ctid in (
    select ctid
    from app_private.multiplayer_idempotency
    where user_id = p_user_id
    order by created_at desc
    offset 127
  );
  insert into app_private.multiplayer_idempotency (
    user_id, operation, idempotency_key, request_hash, response
  ) values (p_user_id, p_operation, p_key, p_request_hash, p_response)
  on conflict (user_id, operation, idempotency_key) do nothing;
  return p_response;
end;
$$;

create or replace function public.multiplayer_leave_room(
  p_room_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_leave_room', 12);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_leave_room', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    -- Settle an elapsed first round before deciding whether this is an early
    -- abandonment. Membership is checked first so leaked UUIDs cannot advance
    -- someone else's room.
    if exists (
      select 1
      from app_private.multiplayer_members
      where room_id = p_room_id and user_id = v_uid and is_active
    ) then
      perform 1
      from app_private.multiplayer_rooms
      where id = p_room_id
      for update;
      perform app_private.multiplayer_advance_locked(p_room_id, now());
    end if;
    return app_private.multiplayer_leave_room_impl(
      p_room_id, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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
    select id
    from app_private.multiplayer_rooms
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
  set status = 'expired',
      phase_ends_at = null,
      completed_at = v_now,
      version = version + 1,
      updated_at = v_now
  where status not in ('completed', 'cancelled', 'expired')
    and expires_at <= v_now;
  get diagnostics v_expired = row_count;

  delete from app_private.multiplayer_active_occupancy occupied
  using app_private.multiplayer_rooms room
  where occupied.room_id = room.id
    and room.status in ('completed', 'cancelled', 'expired');

  delete from app_private.multiplayer_idempotency
  where ctid in (
    select ctid
    from app_private.multiplayer_idempotency
    where created_at < v_now - interval '1 hour'
    order by created_at
    limit 5000
  );
  get diagnostics v_idempotency_deleted = row_count;

  delete from app_private.multiplayer_rooms
  where id in (
    select id
    from app_private.multiplayer_rooms
    where status in ('completed', 'cancelled', 'expired')
      and expires_at <= v_now
    order by expires_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  );
  get diagnostics v_rooms_deleted = row_count;

  delete from app_private.multiplayer_abuse_state
  where updated_at < v_now - interval '30 days'
    and coalesce(blocked_until, '-infinity'::timestamptz) <= v_now;

  return jsonb_build_object(
    'ok', true,
    'progressed', v_progressed,
    'expired', v_expired,
    'idempotency_deleted', v_idempotency_deleted,
    'rooms_deleted', v_rooms_deleted
  );
end;
$$;

comment on function app_private.consume_rpc_rate_limit(uuid, text, integer, integer) is
  'Concurrency-safe fixed-window limiter using timezone-safe timestamptz clocks.';
