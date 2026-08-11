-- Bound multiplayer abuse without putting normal back-to-back play behind a
-- small daily limit. Public RPC signatures stay stable; their implementations
-- move private so wrappers can commit rate accounting even when a request is
-- rejected.

alter table app_private.multiplayer_rooms
  drop constraint if exists multiplayer_rooms_code_check;
alter table app_private.multiplayer_rooms
  add constraint multiplayer_rooms_code_check
  check (code ~ '^[A-Z2-9]{6}$' or code ~ '^[A-Z2-9]{8}$');
alter table app_private.multiplayer_rooms
  alter column expires_at
  set default (now() + interval '2 hours');

create index if not exists multiplayer_rooms_terminal_expiry_idx
  on app_private.multiplayer_rooms (expires_at)
  where status in ('completed', 'cancelled', 'expired');
create index if not exists multiplayer_idempotency_user_created_idx
  on app_private.multiplayer_idempotency (user_id, created_at desc);

create table if not exists app_private.multiplayer_abuse_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  early_abandon_count integer not null default 0
    check (early_abandon_count between 0 and 2),
  penalty_level smallint not null default 0
    check (penalty_level between 0 and 2),
  blocked_until timestamptz,
  last_penalty_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table app_private.multiplayer_abuse_state enable row level security;
revoke all on table app_private.multiplayer_abuse_state
  from public, anon, authenticated;
grant all on table app_private.multiplayer_abuse_state
  to postgres, service_role;

-- Keep identity checks in one private helper. Rate windows are consumed by the
-- public wrappers below so expected application errors cannot roll them back.
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

drop trigger if exists multiplayer_room_guard on app_private.multiplayer_rooms;
create trigger multiplayer_room_guard
  before insert or update of status on app_private.multiplayer_rooms
  for each row execute function app_private.multiplayer_room_guard();

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

drop trigger if exists multiplayer_early_abandon_guard
  on app_private.multiplayer_rooms;
create trigger multiplayer_early_abandon_guard
  after update of status on app_private.multiplayer_rooms
  for each row execute function app_private.multiplayer_early_abandon_guard();

-- Preserve exact mutation replay but cap both lifetime and count per account.
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

-- Move the original implementations behind private wrappers. Their internal
-- actor calls now perform identity checks only.
alter function public.multiplayer_create_room(text[], integer, text)
  set schema app_private;
alter function app_private.multiplayer_create_room(text[], integer, text)
  rename to multiplayer_create_room_impl;
alter function public.multiplayer_join_room(text, text)
  set schema app_private;
alter function app_private.multiplayer_join_room(text, text)
  rename to multiplayer_join_room_impl;
alter function public.multiplayer_update_settings(uuid, text[], integer, text)
  set schema app_private;
alter function app_private.multiplayer_update_settings(uuid, text[], integer, text)
  rename to multiplayer_update_settings_impl;
alter function public.multiplayer_set_ready(uuid, boolean, text)
  set schema app_private;
alter function app_private.multiplayer_set_ready(uuid, boolean, text)
  rename to multiplayer_set_ready_impl;
alter function public.multiplayer_start_match(uuid, text)
  set schema app_private;
alter function app_private.multiplayer_start_match(uuid, text)
  rename to multiplayer_start_match_impl;
alter function public.multiplayer_get_state(uuid)
  set schema app_private;
alter function app_private.multiplayer_get_state(uuid)
  rename to multiplayer_get_state_impl;
alter function public.multiplayer_submit_guess(uuid, uuid, integer, text)
  set schema app_private;
alter function app_private.multiplayer_submit_guess(uuid, uuid, integer, text)
  rename to multiplayer_submit_guess_impl;
alter function public.multiplayer_surrender(uuid, uuid, text)
  set schema app_private;
alter function app_private.multiplayer_surrender(uuid, uuid, text)
  rename to multiplayer_surrender_impl;
alter function public.multiplayer_leave_room(uuid, text)
  set schema app_private;
alter function app_private.multiplayer_leave_room(uuid, text)
  rename to multiplayer_leave_room_impl;

revoke all on function app_private.multiplayer_create_room_impl(text[], integer, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_join_room_impl(text, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_update_settings_impl(uuid, text[], integer, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_set_ready_impl(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_start_match_impl(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_get_state_impl(uuid)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_submit_guess_impl(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_surrender_impl(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_leave_room_impl(uuid, text)
  from public, anon, authenticated;

create or replace function public.multiplayer_create_room(
  p_selected_modes text[],
  p_max_players integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_hash text := md5(coalesce(p_selected_modes::text, '') || ':' || coalesce(p_max_players::text, ''));
  v_cached jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_create_room', 6);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_create_room_10m', 6, 600
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'create_room', p_idempotency_key, v_hash
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  if v_cached is not null then return v_cached; end if;
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_create_room_24h', 100, 86400
  ) then
    return jsonb_build_object('ok', false, 'error', 'create_quota_exceeded');
  end if;
  if app_private.multiplayer_cooldown_until(v_uid) is not null then
    return jsonb_build_object('ok', false, 'error', 'abuse_cooldown');
  end if;
  begin
    return app_private.multiplayer_create_room_impl(
      p_selected_modes, p_max_players, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.multiplayer_join_room(
  p_code text,
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
  v_uid := app_private.multiplayer_require_actor('multiplayer_join_room', 12);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_join_room', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if upper(trim(coalesce(p_code, ''))) !~ '^[A-Z2-9]{6}([A-Z2-9]{2})?$' then
    return jsonb_build_object('ok', false, 'error', 'room_not_joinable');
  end if;
  begin
    return app_private.multiplayer_join_room_impl(p_code, p_idempotency_key);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_update_settings', 12);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_update_settings', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    return app_private.multiplayer_update_settings_impl(
      p_room_id, p_selected_modes, p_max_players, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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
      v_response := app_private.multiplayer_mutation_response(p_room_id, v_uid);
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

create or replace function public.multiplayer_start_match(
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
  v_uid := app_private.multiplayer_require_actor('multiplayer_start_match', 6);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_start_match_10m', 6, 600
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if app_private.multiplayer_cooldown_until(v_uid) is not null then
    return jsonb_build_object('ok', false, 'error', 'abuse_cooldown');
  end if;
  begin
    return app_private.multiplayer_start_match_impl(
      p_room_id, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.multiplayer_get_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_active boolean;
  v_status text;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_get_state', 60);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_get_state', 60, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select member.is_active, room.status
  into v_active, v_status
  from app_private.multiplayer_members member
  join app_private.multiplayer_rooms room on room.id = member.room_id
  where member.room_id = p_room_id and member.user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if not v_active and v_status not in ('completed', 'cancelled', 'expired') then
    return jsonb_build_object('ok', false, 'error', 'member_inactive');
  end if;
  begin
    return app_private.multiplayer_get_state_impl(p_room_id);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_submit_guess', 45);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_submit_guess', 45, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    return app_private.multiplayer_submit_guess_impl(
      p_room_id, p_round_id, p_guess_id, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_surrender', 12);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_surrender', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    return app_private.multiplayer_surrender_impl(
      p_room_id, p_round_id, p_idempotency_key
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
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

revoke all on function app_private.multiplayer_cooldown_until(uuid)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_record_early_abandon(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_room_guard()
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_early_abandon_guard()
  from public, anon, authenticated;
grant execute on function app_private.multiplayer_cooldown_until(uuid)
  to postgres, service_role;
grant execute on function app_private.multiplayer_record_early_abandon(uuid, timestamptz)
  to postgres, service_role;
grant execute on function app_private.multiplayer_room_guard()
  to postgres, service_role;
grant execute on function app_private.multiplayer_early_abandon_guard()
  to postgres, service_role;

grant execute on function app_private.multiplayer_create_room_impl(text[], integer, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_join_room_impl(text, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_update_settings_impl(uuid, text[], integer, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_set_ready_impl(uuid, boolean, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_start_match_impl(uuid, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_get_state_impl(uuid)
  to postgres, service_role;
grant execute on function app_private.multiplayer_submit_guess_impl(uuid, uuid, integer, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_surrender_impl(uuid, uuid, text)
  to postgres, service_role;
grant execute on function app_private.multiplayer_leave_room_impl(uuid, text)
  to postgres, service_role;

revoke all on function public.multiplayer_create_room(text[], integer, text)
  from public, anon;
revoke all on function public.multiplayer_join_room(text, text)
  from public, anon;
revoke all on function public.multiplayer_update_settings(uuid, text[], integer, text)
  from public, anon;
revoke all on function public.multiplayer_set_ready(uuid, boolean, text)
  from public, anon;
revoke all on function public.multiplayer_start_match(uuid, text)
  from public, anon;
revoke all on function public.multiplayer_get_state(uuid)
  from public, anon;
revoke all on function public.multiplayer_submit_guess(uuid, uuid, integer, text)
  from public, anon;
revoke all on function public.multiplayer_surrender(uuid, uuid, text)
  from public, anon;
revoke all on function public.multiplayer_leave_room(uuid, text)
  from public, anon;

grant execute on function public.multiplayer_create_room(text[], integer, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_join_room(text, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_update_settings(uuid, text[], integer, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_set_ready(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_start_match(uuid, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_get_state(uuid)
  to authenticated, service_role;
grant execute on function public.multiplayer_submit_guess(uuid, uuid, integer, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_surrender(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_leave_room(uuid, text)
  to authenticated, service_role;

comment on table app_private.multiplayer_abuse_state is
  'Short-lived host abandonment strikes and progressive Versus cooldowns.';
comment on function public.multiplayer_tick(integer) is
  'Service-role phase tick and bounded retention sweeper; schedule at least once per minute.';
