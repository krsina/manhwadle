-- Private saved lists and collaborative, server-authoritative Versus pools.

create table if not exists app_private.user_saved_lists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_saved_lists_name_check check (
    name = btrim(name)
    and char_length(name) between 1 and 40
    and name !~ '[[:cntrl:]]'
    and name ~ '^[[:alnum:]][[:alnum:] _''&().,+!?:-]{0,39}$'
  )
);

create unique index if not exists user_saved_lists_owner_name_idx
  on app_private.user_saved_lists (owner_user_id, lower(name));
create index if not exists user_saved_lists_owner_updated_idx
  on app_private.user_saved_lists (owner_user_id, updated_at desc);

create table if not exists app_private.user_saved_list_entries (
  list_id uuid not null
    references app_private.user_saved_lists (id) on delete cascade,
  manhwa_id integer not null check (manhwa_id > 0),
  position smallint not null check (position between 0 and 99),
  primary key (list_id, manhwa_id),
  unique (list_id, position)
);

create index if not exists user_saved_list_entries_manhwa_idx
  on app_private.user_saved_list_entries (manhwa_id);

alter table app_private.user_saved_lists enable row level security;
alter table app_private.user_saved_list_entries enable row level security;
revoke all on table app_private.user_saved_lists
  from public, anon, authenticated;
revoke all on table app_private.user_saved_list_entries
  from public, anon, authenticated;
grant all on table app_private.user_saved_lists to postgres, service_role;
grant all on table app_private.user_saved_list_entries to postgres, service_role;

create or replace function app_private.saved_list_normalize_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select nullif(btrim(p_name), '');
$$;

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
     or cardinality(p_manhwa_ids) not between 3 and 100
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

create or replace function app_private.saved_list_json(
  p_list_id uuid,
  p_owner_user_id uuid,
  p_include_entries boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select jsonb_build_object(
    'id', list.id,
    'name', list.name,
    'entry_count', count(entry.manhwa_id)::integer,
    'manhwa_ids', case when p_include_entries
      then coalesce(
        jsonb_agg(entry.manhwa_id order by entry.position)
          filter (where entry.manhwa_id is not null),
        '[]'::jsonb
      )
      else null
    end,
    'created_at', list.created_at,
    'updated_at', list.updated_at
  )
  from app_private.user_saved_lists list
  left join app_private.user_saved_list_entries entry
    on entry.list_id = list.id
  where list.id = p_list_id and list.owner_user_id = p_owner_user_id
  group by list.id;
$$;

create or replace function public.saved_list_list_mine()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_lists jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_list_mine', 30);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_list_mine', 30, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', list.id,
    'name', list.name,
    'entry_count', (
      select count(*)::integer
      from app_private.user_saved_list_entries entry
      where entry.list_id = list.id
    ),
    'created_at', list.created_at,
    'updated_at', list.updated_at
  ) order by list.updated_at desc, list.id), '[]'::jsonb)
  into v_lists
  from app_private.user_saved_lists list
  where list.owner_user_id = v_uid;
  return jsonb_build_object('ok', true, 'lists', v_lists);
end;
$$;

create or replace function public.saved_list_get(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_list jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_get', 30);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_get', 30, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_list := app_private.saved_list_json(p_list_id, v_uid, true);
  if v_list is null then
    return jsonb_build_object('ok', false, 'error', 'list_not_found');
  end if;
  return jsonb_build_object('ok', true, 'list', v_list);
end;
$$;

create or replace function public.saved_list_create(
  p_name text,
  p_manhwa_ids integer[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_name text;
  v_ids integer[];
  v_list_id uuid;
  v_hash text := md5(concat_ws(':', p_name, p_manhwa_ids::text));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_create', 10);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_create_10m', 10, 600
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'saved_list_create', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    v_name := app_private.saved_list_normalize_name(p_name);
    if v_name is null
       or v_name !~ '^[[:alnum:]][[:alnum:] _''&().,+!?:-]{0,39}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_list_name');
    end if;
    v_ids := app_private.saved_list_validate_ids(p_manhwa_ids);
    perform pg_advisory_xact_lock(
      hashtext(v_uid::text), hashtext('saved_list_create')
    );
    if (
      select count(*) from app_private.user_saved_lists
      where owner_user_id = v_uid
    ) >= 10 then
      return jsonb_build_object('ok', false, 'error', 'list_limit_reached');
    end if;
    if exists (
      select 1 from app_private.user_saved_lists
      where owner_user_id = v_uid and lower(name) = lower(v_name)
    ) then
      return jsonb_build_object('ok', false, 'error', 'list_name_taken');
    end if;
    insert into app_private.user_saved_lists (owner_user_id, name)
    values (v_uid, v_name)
    returning id into v_list_id;
    insert into app_private.user_saved_list_entries (list_id, manhwa_id, position)
    select v_list_id, id, (ordinal - 1)::smallint
    from unnest(v_ids) with ordinality supplied(id, ordinal);
    v_response := jsonb_build_object(
      'ok', true,
      'list', app_private.saved_list_json(v_list_id, v_uid, true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'saved_list_create', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'list_name_taken');
  end;
end;
$$;

create or replace function public.saved_list_rename(
  p_list_id uuid,
  p_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_name text;
  v_hash text := md5(concat_ws(':', p_list_id, p_name));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_rename', 20);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_rename', 20, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'saved_list_rename', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    v_name := app_private.saved_list_normalize_name(p_name);
    if v_name is null
       or v_name !~ '^[[:alnum:]][[:alnum:] _''&().,+!?:-]{0,39}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_list_name');
    end if;
    update app_private.user_saved_lists
    set name = v_name, updated_at = now()
    where id = p_list_id and owner_user_id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'list_not_found');
    end if;
    v_response := jsonb_build_object(
      'ok', true,
      'list', app_private.saved_list_json(p_list_id, v_uid, true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'saved_list_rename', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'list_name_taken');
  end;
end;
$$;

create or replace function public.saved_list_set_entries(
  p_list_id uuid,
  p_manhwa_ids integer[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid;
  v_ids integer[];
  v_hash text := md5(concat_ws(':', p_list_id, p_manhwa_ids::text));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_set_entries', 20);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_set_entries', 20, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'saved_list_set_entries', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    v_ids := app_private.saved_list_validate_ids(p_manhwa_ids);
    perform pg_advisory_xact_lock(
      hashtext(v_uid::text), hashtext(p_list_id::text)
    );
    perform 1 from app_private.user_saved_lists
    where id = p_list_id and owner_user_id = v_uid
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'list_not_found');
    end if;
    delete from app_private.user_saved_list_entries
    where list_id = p_list_id;
    insert into app_private.user_saved_list_entries (list_id, manhwa_id, position)
    select p_list_id, id, (ordinal - 1)::smallint
    from unnest(v_ids) with ordinality supplied(id, ordinal);
    update app_private.user_saved_lists
    set updated_at = now()
    where id = p_list_id;
    v_response := jsonb_build_object(
      'ok', true,
      'list', app_private.saved_list_json(p_list_id, v_uid, true)
    );
    return app_private.multiplayer_idempotency_put(
      v_uid, 'saved_list_set_entries', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.saved_list_delete(
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
  v_hash text := md5(coalesce(p_list_id::text, ''));
  v_cached jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor('saved_list_delete', 12);
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'saved_list_delete', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'saved_list_delete', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    delete from app_private.user_saved_lists
    where id = p_list_id and owner_user_id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'list_not_found');
    end if;
    v_response := jsonb_build_object('ok', true, 'deleted', true);
    return app_private.multiplayer_idempotency_put(
      v_uid, 'saved_list_delete', p_idempotency_key, v_hash, v_response
    );
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.export_saved_lists_account(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', list.id,
    'name', list.name,
    'manhwa_ids', coalesce((
      select jsonb_agg(entry.manhwa_id order by entry.position)
      from app_private.user_saved_list_entries entry
      where entry.list_id = list.id
    ), '[]'::jsonb),
    'created_at', list.created_at,
    'updated_at', list.updated_at
  ) order by list.updated_at desc), '[]'::jsonb)
  from app_private.user_saved_lists list
  where list.owner_user_id = p_user_id;
$$;

alter table app_private.multiplayer_rooms
  add column if not exists pool_source text not null default 'both';
alter table app_private.multiplayer_rooms
  drop constraint if exists multiplayer_rooms_pool_source_check;
alter table app_private.multiplayer_rooms
  add constraint multiplayer_rooms_pool_source_check check (
    pool_source = any (array[
      'action'::text, 'romance'::text, 'both'::text,
      'collaborative_lists'::text
    ])
  );
update app_private.multiplayer_rooms
set pool_source = taste
where pool_source = 'both' and taste in ('action', 'romance');

create table if not exists app_private.multiplayer_list_contributions (
  room_id uuid not null,
  user_id uuid not null,
  source_list_id uuid
    references app_private.user_saved_lists (id) on delete set null,
  list_name text not null check (
    char_length(list_name) between 1 and 40
    and list_name !~ '[[:cntrl:]]'
  ),
  entry_count smallint not null check (entry_count between 3 and 100),
  contributed_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id)
    references app_private.multiplayer_members (room_id, user_id)
    on delete cascade
);

create table if not exists app_private.multiplayer_list_contribution_entries (
  room_id uuid not null,
  user_id uuid not null,
  manhwa_id integer not null check (manhwa_id > 0),
  primary key (room_id, user_id, manhwa_id),
  foreign key (room_id, user_id)
    references app_private.multiplayer_list_contributions (room_id, user_id)
    on delete cascade
);

create index if not exists multiplayer_contribution_entries_room_manhwa_idx
  on app_private.multiplayer_list_contribution_entries (room_id, manhwa_id);
alter table app_private.multiplayer_list_contributions enable row level security;
alter table app_private.multiplayer_list_contribution_entries enable row level security;
revoke all on table app_private.multiplayer_list_contributions
  from public, anon, authenticated;
revoke all on table app_private.multiplayer_list_contribution_entries
  from public, anon, authenticated;
grant all on table app_private.multiplayer_list_contributions
  to postgres, service_role;
grant all on table app_private.multiplayer_list_contribution_entries
  to postgres, service_role;

create or replace function app_private.multiplayer_contribution_eligible_count(
  p_room_id uuid,
  p_user_id uuid,
  p_mode text
)
returns integer
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select count(distinct entry.manhwa_id)::integer
  from app_private.multiplayer_list_contribution_entries entry
  where entry.room_id = p_room_id
    and entry.user_id = p_user_id
    and exists (
      select 1
      from public.puzzle_pool_entries pool
      where pool.manhwa_id = entry.manhwa_id
        and pool.mode = p_mode
        and app_private.multiplayer_normalize_clue(p_mode, pool.meta) is not null
    )
    and not exists (
      select 1 from public.daily_puzzles daily
      where daily.date_key = public.current_utc_date_key()
        and daily.answer_id = entry.manhwa_id
    );
$$;

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
    'required_contributor_count', (
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

create or replace function app_private.multiplayer_contributions_state(
  p_room_id uuid,
  p_viewer_id uuid,
  p_modes text[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', contribution.user_id,
    'username', coalesce(profile.username, 'Player'),
    'list_name', contribution.list_name,
    'entry_count', contribution.entry_count,
    'eligible_counts', coalesce((
      select jsonb_object_agg(selected.mode,
        app_private.multiplayer_contribution_eligible_count(
          p_room_id, contribution.user_id, selected.mode
        )
      )
      from unnest(p_modes) selected(mode)
    ), '{}'::jsonb),
    'combined_eligible_count', (
      select count(distinct entry.manhwa_id)::integer
      from app_private.multiplayer_list_contribution_entries entry
      where entry.room_id = p_room_id
        and entry.user_id = contribution.user_id
        and exists (
          select 1 from public.puzzle_pool_entries pool
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
    ),
    'contributed_at', contribution.contributed_at,
    'source_list_id', case
      when contribution.user_id = p_viewer_id
        then contribution.source_list_id
      else null
    end
  ) order by member.seat), '[]'::jsonb)
  from app_private.multiplayer_list_contributions contribution
  join app_private.multiplayer_members member
    on member.room_id = contribution.room_id
   and member.user_id = contribution.user_id
   and member.is_active
  left join public.public_profiles profile
    on profile.user_id = contribution.user_id
  where contribution.room_id = p_room_id;
$$;

alter function app_private.multiplayer_state(uuid, uuid)
  rename to multiplayer_state_before_collaborative_pools;

create or replace function app_private.multiplayer_state(
  p_room_id uuid,
  p_viewer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_base jsonb;
  v_room app_private.multiplayer_rooms%rowtype;
begin
  v_base := app_private.multiplayer_state_before_collaborative_pools(
    p_room_id, p_viewer_id
  );
  if v_base ? 'error' then return v_base; end if;
  select * into v_room
  from app_private.multiplayer_rooms
  where id = p_room_id;
  return jsonb_set(
    v_base,
    '{room}',
    (v_base -> 'room') || jsonb_build_object(
      'pool_source', v_room.pool_source
    )
  ) || jsonb_build_object(
    'list_contributions',
      app_private.multiplayer_contributions_state(
        p_room_id, p_viewer_id, v_room.selected_modes
      ),
    'pool_summary',
      app_private.multiplayer_pool_summary(
        p_room_id, v_room.selected_modes
      )
  );
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
      if v_entry_count not between 3 and 100 then
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
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.multiplayer_update_settings(
  p_room_id uuid,
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
  v_old_source text;
  v_hash text := md5(concat_ws(
    ':', p_room_id, p_selected_modes::text, p_max_players, v_source
  ));
  v_cached jsonb;
  v_updated jsonb;
  v_response jsonb;
begin
  v_uid := app_private.multiplayer_require_actor(
    'multiplayer_update_settings', 12
  );
  if not app_private.consume_rpc_rate_limit(
    v_uid, 'multiplayer_update_settings', 12, 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_cached := app_private.multiplayer_idempotency_get(
      v_uid, 'update_settings_with_pool', p_idempotency_key, v_hash
    );
    if v_cached is not null then return v_cached; end if;
    if v_source not in ('action', 'romance', 'both', 'collaborative_lists') then
      return jsonb_build_object('ok', false, 'error', 'invalid_pool_source');
    end if;
    select pool_source into v_old_source
    from app_private.multiplayer_rooms
    where id = p_room_id and host_user_id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'host_required');
    end if;
    v_updated := app_private.multiplayer_update_settings_impl(
      p_room_id,
      p_selected_modes,
      p_max_players,
      md5('pool:' || coalesce(p_idempotency_key, ''))
    );
    if coalesce(v_updated ->> 'ok', 'false') <> 'true' then
      return v_updated;
    end if;
    update app_private.multiplayer_rooms
    set pool_source = v_source,
        taste = case when v_source = 'collaborative_lists'
          then 'both' else v_source end,
        version = version + case when pool_source <> v_source then 1 else 0 end,
        updated_at = now()
    where id = p_room_id;
    if v_old_source <> v_source then
      delete from app_private.multiplayer_list_contributions
      where room_id = p_room_id;
    end if;
    update app_private.multiplayer_members
    set is_ready = false
    where room_id = p_room_id and is_active;
    v_response := app_private.multiplayer_mutation_response(p_room_id, v_uid);
    return app_private.multiplayer_idempotency_put(
      v_uid, 'update_settings_with_pool', p_idempotency_key, v_hash, v_response
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
    if coalesce(p_ready, false) and exists (
      select 1
      from app_private.multiplayer_rooms room
      join app_private.multiplayer_members member
        on member.room_id = room.id
      where room.id = p_room_id
        and room.pool_source = 'collaborative_lists'
        and member.user_id = v_uid
        and member.is_active
        and not exists (
          select 1
          from app_private.multiplayer_list_contributions contribution
          where contribution.room_id = p_room_id
            and contribution.user_id = v_uid
        )
    ) then
      return jsonb_build_object(
        'ok', false, 'error', 'list_contribution_required'
      );
    end if;
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
  if v_room.pool_source = 'collaborative_lists' and exists (
    select 1
    from app_private.multiplayer_members member
    where member.room_id = p_room_id
      and member.is_active
      and not exists (
        select 1
        from app_private.multiplayer_list_contributions contribution
        where contribution.room_id = p_room_id
          and contribution.user_id = member.user_id
      )
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

revoke all on function app_private.saved_list_normalize_name(text)
  from public, anon, authenticated;
revoke all on function app_private.saved_list_validate_ids(integer[])
  from public, anon, authenticated;
revoke all on function app_private.saved_list_json(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_contribution_eligible_count(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.multiplayer_pool_summary(uuid, text[])
  from public, anon, authenticated;
revoke all on function app_private.multiplayer_contributions_state(
  uuid, uuid, text[]
) from public, anon, authenticated;
revoke all on function app_private.multiplayer_state_before_collaborative_pools(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function app_private.multiplayer_start_match_impl(uuid, text)
  from public, anon, authenticated;

revoke all on function public.saved_list_list_mine()
  from public, anon;
revoke all on function public.saved_list_get(uuid)
  from public, anon;
revoke all on function public.saved_list_create(text, integer[], text)
  from public, anon;
revoke all on function public.saved_list_rename(uuid, text, text)
  from public, anon;
revoke all on function public.saved_list_set_entries(uuid, integer[], text)
  from public, anon;
revoke all on function public.saved_list_delete(uuid, text)
  from public, anon;
revoke all on function public.multiplayer_set_list_contribution(
  uuid, uuid, text
) from public, anon;
revoke all on function public.multiplayer_create_room(
  text[], integer, text, text
) from public, anon;
revoke all on function public.multiplayer_update_settings(
  uuid, text[], integer, text, text
) from public, anon;

grant execute on function public.saved_list_list_mine()
  to authenticated, service_role;
grant execute on function public.saved_list_get(uuid)
  to authenticated, service_role;
grant execute on function public.saved_list_create(text, integer[], text)
  to authenticated, service_role;
grant execute on function public.saved_list_rename(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.saved_list_set_entries(uuid, integer[], text)
  to authenticated, service_role;
grant execute on function public.saved_list_delete(uuid, text)
  to authenticated, service_role;
grant execute on function public.multiplayer_set_list_contribution(
  uuid, uuid, text
) to authenticated, service_role;
grant execute on function public.multiplayer_create_room(
  text[], integer, text, text
) to authenticated, service_role;
grant execute on function public.multiplayer_update_settings(
  uuid, text[], integer, text, text
) to authenticated, service_role;

-- The pooled signatures supersede the temporary compatibility overloads.
-- Remove them before PostgREST refreshes so clients have one authoritative
-- create/update contract and cannot bypass pool_source validation.
drop function if exists public.multiplayer_create_room(text[], integer, text);
drop function if exists public.multiplayer_update_settings(
  uuid, text[], integer, text
);

revoke all on function public.export_saved_lists_account(uuid)
  from public, anon, authenticated;
grant execute on function public.export_saved_lists_account(uuid)
  to service_role;

comment on table app_private.user_saved_lists is
  'Private account-owned Versus lists; RPC-only and never publicly discoverable.';
comment on table app_private.multiplayer_list_contribution_entries is
  'Immutable room-scoped snapshots. Only sanitized aggregate metadata leaves app_private.';
