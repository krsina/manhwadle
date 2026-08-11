-- Saved lists may span the whole catalog instead of stopping at 100 titles.
-- The catalog membership and duplicate checks already cap a list at the number
-- of titles that exist, so only the minimum stays fixed.

alter table app_private.user_saved_list_entries
  drop constraint if exists user_saved_list_entries_position_check;
alter table app_private.user_saved_list_entries
  alter column "position" type integer;
alter table app_private.user_saved_list_entries
  add constraint user_saved_list_entries_position_check check ("position" >= 0);

alter table app_private.multiplayer_list_contributions
  drop constraint if exists multiplayer_list_contributions_entry_count_check;
alter table app_private.multiplayer_list_contributions
  alter column entry_count type integer;
alter table app_private.multiplayer_list_contributions
  add constraint multiplayer_list_contributions_entry_count_check
  check (entry_count >= 3);

create or replace function app_private.saved_list_validate_ids(p_manhwa_ids integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_ids integer[];
begin
  if p_manhwa_ids is null
     or cardinality(p_manhwa_ids) < 3
     or array_position(p_manhwa_ids, null) is not null
     or exists (select 1 from unnest(p_manhwa_ids) id where id <= 0) then
    raise exception using errcode = 'P0001', message = 'invalid_list_entries';
  end if;
  select array_agg(id order by ordinal)
  into v_ids
  from (
    select id, min(ordinal) as ordinal
    from unnest(p_manhwa_ids) with ordinality supplied(id, ordinal)
    group by id
  ) normalized;
  if cardinality(v_ids) <> cardinality(p_manhwa_ids) then
    raise exception using errcode = 'P0001', message = 'duplicate_list_title';
  end if;
  if exists (
    select 1
    from unnest(v_ids) id
    where not exists (
      select 1
      from public.puzzle_pool_entries pool
      where pool.manhwa_id = id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'list_title_not_in_catalog';
  end if;
  return v_ids;
end;
$$;

create or replace function public.multiplayer_set_list_contribution(
  p_room_id uuid,
  p_list_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_room app_private.multiplayer_rooms%rowtype;
  v_list app_private.user_saved_lists%rowtype;
  v_entry_count integer;
  v_hash text := md5(concat_ws(':', p_room_id, p_list_id));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor(
    'multiplayer_set_list_contribution', 12
  );
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_set_list_contribution', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'set_list_contribution', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    select * into v_room
    from app_private.multiplayer_rooms
    where id = p_room_id
    for update;
    if not found or v_room.status <> 'lobby' then
      return jsonb_build_object('ok', false, 'error', 'room_not_in_lobby');
    end if;
    if v_room.pool_source <> 'collaborative_lists' then
      return jsonb_build_object('ok', false, 'error', 'collaborative_pool_required');
    end if;
    if not exists (
      select 1 from app_private.multiplayer_members member
      where member.room_id = p_room_id
        and member.user_id = v_uid
        and member.is_active
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_room_member');
    end if;
    if p_list_id is not null then
      select * into v_list
      from app_private.user_saved_lists list
      where list.id = p_list_id and list.owner_user_id = v_uid
      for share;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'list_not_found');
      end if;
      select count(*)::integer into v_entry_count
      from app_private.user_saved_list_entries
      where list_id = p_list_id;
      if v_entry_count < 3 then
        return jsonb_build_object('ok', false, 'error', 'invalid_list_entries');
      end if;
    end if;
    delete from app_private.multiplayer_list_contributions
    where room_id = p_room_id and user_id = v_uid;
    if p_list_id is not null then
      insert into app_private.multiplayer_list_contributions (
        room_id, user_id, source_list_id, list_name, entry_count
      ) values (
        p_room_id, v_uid, p_list_id, v_list.name, v_entry_count
      );
      insert into app_private.multiplayer_list_contribution_entries (
        room_id, user_id, manhwa_id
      )
      select p_room_id, v_uid, entry.manhwa_id
      from app_private.user_saved_list_entries entry
      where entry.list_id = p_list_id;
    end if;
    update app_private.multiplayer_members
    set is_ready = false
    where room_id = p_room_id and is_active;
    update app_private.multiplayer_rooms
    set version = version + 1, updated_at = now()
    where id = p_room_id;
    v_response := app_private.multiplayer_mutation_response(
      p_room_id, v_uid,
      jsonb_build_object('contributed', p_list_id is not null)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'set_list_contribution', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

revoke all on function app_private.saved_list_validate_ids(integer[])
  from public, anon, authenticated;
revoke all on function public.multiplayer_set_list_contribution(uuid, uuid, text)
  from public, anon;
grant execute on function public.multiplayer_set_list_contribution(uuid, uuid, text)
  to authenticated, service_role;
