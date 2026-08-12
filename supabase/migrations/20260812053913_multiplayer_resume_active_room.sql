-- Let players discover and leave a stuck active Versus seat after closing the tab.

create or replace function app_private.multiplayer_active_room_payload(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select case
    when occupied.room_id is null then null
    else jsonb_build_object(
      'id', room.id,
      'code', room.code,
      'status', room.status,
      'is_host', room.host_user_id = p_user_id,
      'member_count', (
        select count(*)::integer
        from app_private.multiplayer_members member
        where member.room_id = room.id and member.is_active
      ),
      'max_players', room.max_players
    )
  end
  from (select p_user_id as user_id) actor
  left join app_private.multiplayer_active_occupancy occupied
    on occupied.user_id = actor.user_id
  left join app_private.multiplayer_rooms room
    on room.id = occupied.room_id;
$$;

revoke all on function app_private.multiplayer_active_room_payload(uuid)
  from public, anon, authenticated;
grant execute on function app_private.multiplayer_active_room_payload(uuid)
  to postgres, service_role;

create or replace function public.multiplayer_get_my_active_room()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_get_my_active_room', 30);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_get_my_active_room', 30, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object(
    'ok', true,
    'room', app_private.multiplayer_active_room_payload(v_uid)
  );
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.multiplayer_get_my_active_room()
  from public, anon;
grant execute on function public.multiplayer_get_my_active_room()
  to authenticated, service_role;

create or replace function public.multiplayer_create_room(
  p_selected_modes text[],
  p_max_players integer,
  p_pool_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_source text := lower(btrim(coalesce(p_pool_source, '')));
  v_hash text := md5(concat_ws(
    ':', p_selected_modes::text, p_max_players, v_source
  ));
  v_cached jsonb;
  v_created jsonb;
  v_room_id uuid;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('multiplayer_create_room', 6);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_create_room_10m', 6, 600
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'create_room_with_pool', p_idempotency_key, v_hash
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  if v_cached is not null then return v_cached; end if;
  if v_source not in ('action', 'romance', 'both', 'collaborative_lists') then
    return jsonb_build_object('ok', false, 'error', 'invalid_pool_source');
  end if;
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_create_room_24h', 100, 86400
  ) then
    return jsonb_build_object('ok', false, 'error', 'create_quota_exceeded');
  end if;
  if app_private.multiplayer_cooldown_until(v_uid) is not null then
    return jsonb_build_object('ok', false, 'error', 'abuse_cooldown');
  end if;
  begin
    v_created := app_private.multiplayer_create_room_impl(
      p_selected_modes,
      p_max_players,
      md5('pool:' || coalesce(p_idempotency_key, ''))
    );
    v_room_id := (v_created -> 'state' -> 'room' ->> 'id')::uuid;
    if v_room_id is null then
      return coalesce(
        v_created,
        jsonb_build_object('ok', false, 'error', 'room_unavailable')
      );
    end if;
    update app_private.multiplayer_rooms
    set pool_source = v_source,
        taste = case when v_source = 'collaborative_lists'
          then 'both' else v_source end,
        version = version + 1,
        updated_at = now()
    where id = v_room_id and host_user_id = v_uid;
    v_response := app_private.multiplayer_mutation_response(
      v_room_id, v_uid, jsonb_build_object('created', true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'create_room_with_pool', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'active_room_exists' then
      return jsonb_build_object(
        'ok', false,
        'error', 'active_room_exists',
        'room', app_private.multiplayer_active_room_payload(v_uid)
      );
    end if;
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
    if sqlerrm = 'active_room_exists' then
      return jsonb_build_object(
        'ok', false,
        'error', 'active_room_exists',
        'room', app_private.multiplayer_active_room_payload(v_uid)
      );
    end if;
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;
