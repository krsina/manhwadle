-- Live character banner: server-authoritative pulls, pity, copies, and weekly featured buys.
-- Paid avatar catalog purchases are retired; stages still use purchase_shop_item.

alter table app_private.point_transactions
  drop constraint if exists point_transactions_source_type_check;

alter table app_private.point_transactions
  add constraint point_transactions_source_type_check check (
    source_type in (
      'daily_completion',
      'achievement',
      'shop_purchase',
      'refund',
      'admin_adjustment',
      'bonus_name',
      'all_modes_day',
      'rewarded_ad',
      'gacha_pull',
      'gacha_weekly'
    )
  );

create or replace function app_private.apply_point_transaction(
  p_user_id uuid,
  p_delta integer,
  p_source_type text,
  p_source_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_balance integer;
  v_existing app_private.point_transactions%rowtype;
begin
  if p_user_id is null or p_delta is null or p_delta = 0
    or p_source_id is null or btrim(p_source_id) = '' then
    return jsonb_build_object('applied', false, 'delta', 0, 'balance', 0);
  end if;
  if p_source_type not in (
    'daily_completion',
    'achievement',
    'shop_purchase',
    'refund',
    'admin_adjustment',
    'bonus_name',
    'all_modes_day',
    'rewarded_ad',
    'gacha_pull',
    'gacha_weekly'
  ) then
    raise exception 'Invalid point source' using errcode = '22023';
  end if;

  perform app_private.ensure_shop_account(p_user_id);
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('shop_points'));

  select *
  into v_existing
  from app_private.point_transactions pt
  where pt.user_id = p_user_id
    and pt.source_type = p_source_type
    and pt.source_id = p_source_id;

  if found then
    select balance into v_balance
    from public.user_point_balances
    where user_id = p_user_id;
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', coalesce(v_balance, v_existing.balance_after)
    );
  end if;

  select balance
  into v_balance
  from public.user_point_balances
  where user_id = p_user_id
  for update;

  if v_balance + p_delta < 0 then
    raise exception 'Insufficient points' using errcode = 'P0001';
  end if;

  v_balance := v_balance + p_delta;
  update public.user_point_balances
  set balance = v_balance,
      lifetime_earned = lifetime_earned + greatest(p_delta, 0),
      lifetime_spent = lifetime_spent + greatest(-p_delta, 0),
      updated_at = timezone('utc', now())
  where user_id = p_user_id;

  insert into app_private.point_transactions (
    user_id, delta, balance_after, source_type, source_id, metadata
  ) values (
    p_user_id,
    p_delta,
    v_balance,
    p_source_type,
    p_source_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object('applied', true, 'delta', p_delta, 'balance', v_balance);
end;
$$;

create table if not exists public.user_gacha_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pull_count integer not null default 0 check (pull_count >= 0),
  pulls_since_rare_plus integer not null default 0 check (pulls_since_rare_plus >= 0),
  last_character_id text,
  last_rarity text check (last_rarity in ('common', 'rare', 'epic', 'legendary')),
  last_is_new boolean,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_gacha_copies (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete restrict,
  copies integer not null check (copies >= 1),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, item_id)
);

alter table public.user_gacha_state enable row level security;
alter table public.user_gacha_copies enable row level security;

revoke all on table public.user_gacha_state from public, anon, authenticated;
revoke all on table public.user_gacha_copies from public, anon, authenticated;
grant all on table public.user_gacha_state to service_role;
grant all on table public.user_gacha_copies to service_role;

insert into public.user_gacha_copies (user_id, item_id, copies)
select ent.user_id, ent.item_id, 1
from public.user_shop_entitlements ent
join public.shop_items si on si.id = ent.item_id
where si.item_type = 'avatar'
on conflict (user_id, item_id) do nothing;

create or replace function app_private.ensure_gacha_state(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
begin
  insert into public.user_gacha_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function app_private.gacha_week_key(p_now timestamptz default timezone('utc', now()))
returns text
language sql
stable
set search_path to 'pg_catalog'
as $$
  select to_char(timezone('utc', p_now), 'IYYY-"W"IW');
$$;

create or replace function app_private.gacha_weekly_price(p_rarity text)
returns integer
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case p_rarity
    when 'common' then 1200
    when 'rare' then 2000
    when 'epic' then 4000
    when 'legendary' then 6000
    else 2000
  end;
$$;

create or replace function app_private.gacha_band(p_rarity text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
    when p_rarity = 'legendary' then 'legendary'
    when p_rarity = 'epic' then 'epic'
    when p_rarity = 'rare' then 'rare'
    else 'common'
  end;
$$;

create or replace function app_private.gacha_pick_id(p_rarity text, p_exclude text default null)
returns text
language plpgsql
volatile
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_id text;
begin
  -- Never fall up in rarity. An empty band is a failed pull, not a free upgrade.
  if p_rarity not in ('common', 'rare', 'epic', 'legendary') then
    return null;
  end if;

  select si.id
    into v_id
  from public.shop_items si
  where si.active
    and si.item_type = 'avatar'
    and si.id not in ('avatar_default_female', 'avatar_default_male')
    and app_private.gacha_band(si.rarity) = p_rarity
    and (p_exclude is null or si.id <> p_exclude)
  order by random()
  limit 1;

  return v_id;
end;
$$;

create or replace function app_private.gacha_weekly_featured(p_now timestamptz default timezone('utc', now()))
returns table(item_id text, rarity text, price integer, slot integer)
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_week text := app_private.gacha_week_key(p_now);
  v_slots text[] := array['common', 'rare', 'rare', 'epic'];
  v_slot integer;
  v_rarity text;
  v_id text;
  v_used text[] := array[]::text[];
begin
  for v_slot in 1 .. array_length(v_slots, 1) loop
    v_rarity := v_slots[v_slot];
    v_id := null;

    select si.id
      into v_id
    from public.shop_items si
    where si.active
      and si.item_type = 'avatar'
      and si.id not in ('avatar_default_female', 'avatar_default_male')
      and app_private.gacha_band(si.rarity) = v_rarity
      and not (si.id = any (v_used))
    order by md5(v_week || ':' || v_slot::text || ':' || si.id)
    limit 1;

    -- Skip empty slots instead of substituting a higher rarity.

    if v_id is not null then
      v_used := array_append(v_used, v_id);
      item_id := v_id;
      rarity := app_private.gacha_band((
        select si.rarity from public.shop_items si where si.id = v_id
      ));
      price := app_private.gacha_weekly_price(rarity);
      if coalesce(price, 0) < 1 then
        continue;
      end if;
      slot := v_slot;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function app_private.gacha_owned_json(p_user_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(jsonb_object_agg(item_id, copies), '{}'::jsonb)
  from (
    select c.item_id, c.copies
    from public.user_gacha_copies c
    where c.user_id = p_user_id
    union all
    select starter.id, 1
    from (values ('avatar_default_female'), ('avatar_default_male')) as starter(id)
    where not exists (
      select 1
      from public.user_gacha_copies c
      where c.user_id = p_user_id and c.item_id = starter.id
    )
  ) owned;
$$;

create or replace function app_private.grant_gacha_copy(p_user_id uuid, p_item_id text)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_copies integer;
begin
  if p_user_id is null or p_item_id is null or btrim(p_item_id) = '' then
    raise exception 'Invalid gacha item' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.shop_items si
    where si.id = p_item_id
      and si.active
      and si.item_type = 'avatar'
  ) then
    raise exception 'Invalid gacha item' using errcode = '22023';
  end if;

  insert into public.user_gacha_copies (user_id, item_id, copies)
  values (p_user_id, p_item_id, 1)
  on conflict (user_id, item_id) do update set
    copies = public.user_gacha_copies.copies + 1,
    updated_at = timezone('utc', now())
  returning copies into v_copies;

  insert into public.user_shop_entitlements (user_id, item_id)
  values (p_user_id, p_item_id)
  on conflict (user_id, item_id) do nothing;

  return v_copies;
end;
$$;

create or replace function app_private.gacha_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_balance integer := 0;
  v_equipped text := 'avatar_default_female';
  v_state public.user_gacha_state%rowtype;
  v_featured jsonb;
begin
  if p_user_id is not null then
    select balance into v_balance
    from public.user_point_balances
    where user_id = p_user_id;
    select equipped_item_id into v_equipped
    from public.user_avatar_profiles
    where user_id = p_user_id;
    select * into v_state
    from public.user_gacha_state
    where user_id = p_user_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.item_id,
        'rarity', f.rarity,
        'price', f.price
      )
      order by f.slot
    ),
    '[]'::jsonb
  )
  into v_featured
  from app_private.gacha_weekly_featured() f;

  return jsonb_build_object(
    'ok', true,
    'authenticated', p_user_id is not null,
    'balance', coalesce(v_balance, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female'),
    'pity', jsonb_build_object(
      'pullCount', coalesce(v_state.pull_count, 0),
      'pullsSinceRarePlus', coalesce(v_state.pulls_since_rare_plus, 0)
    ),
    'owned', case
      when p_user_id is null then jsonb_build_object(
        'avatar_default_female', 1,
        'avatar_default_male', 1
      )
      else app_private.gacha_owned_json(p_user_id)
    end,
    'last_result', case
      when v_state.last_character_id is null then null
      else jsonb_build_object(
        'characterId', v_state.last_character_id,
        'rarity', v_state.last_rarity,
        'isNew', coalesce(v_state.last_is_new, false)
      )
    end,
    'featured', v_featured
  );
end;
$$;

create or replace function public.get_gacha_state()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    perform app_private.ensure_shop_account(v_uid);
    perform app_private.ensure_gacha_state(v_uid);
  end if;
  return app_private.gacha_snapshot(v_uid);
end;
$$;

create or replace function public.pull_gacha()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_state public.user_gacha_state%rowtype;
  v_next integer;
  v_rand double precision;
  v_rarity text;
  v_item_id text;
  v_owned_before integer := 0;
  v_is_new boolean;
  v_points jsonb;
  v_copies integer;
  v_balance integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);
  perform app_private.ensure_gacha_state(v_uid);
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('shop_points'));

  select coalesce(balance, 0) into v_balance
  from public.user_point_balances
  where user_id = v_uid;
  if v_balance < 400 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, 'pull_gacha', 20, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state
  from public.user_gacha_state
  where user_id = v_uid
  for update;

  v_next := v_state.pull_count + 1;
  if v_next % 40 = 0 then
    v_rarity := 'epic';
  else
    v_rand := random();
    if v_rand < 0.05 then
      v_rarity := 'common';
    elsif v_rand < 0.75 then
      v_rarity := 'rare';
    elsif v_rand < 0.99 then
      v_rarity := 'epic';
    else
      v_rarity := 'legendary';
    end if;
    if v_state.pulls_since_rare_plus >= 9 and v_rarity = 'common' then
      v_rarity := 'rare';
    end if;
  end if;

  v_item_id := app_private.gacha_pick_id(v_rarity);
  if v_item_id is null then
    return jsonb_build_object('ok', false, 'error', 'empty_pool');
  end if;

  begin
    v_points := app_private.apply_point_transaction(
      v_uid,
      -400,
      'gacha_pull',
      'gacha_pull:' || gen_random_uuid()::text,
      jsonb_build_object('item_id', v_item_id, 'rarity', v_rarity, 'pull_count', v_next)
    );
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end;

  if not coalesce((v_points ->> 'applied')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
  end if;

  select coalesce(copies, 0) into v_owned_before
  from public.user_gacha_copies
  where user_id = v_uid and item_id = v_item_id;

  v_is_new := v_owned_before < 1
    and v_item_id not in ('avatar_default_female', 'avatar_default_male');
  v_copies := app_private.grant_gacha_copy(v_uid, v_item_id);

  update public.user_gacha_state
  set pull_count = v_next,
      pulls_since_rare_plus = case
        when v_rarity in ('rare', 'epic', 'legendary') then 0
        else v_state.pulls_since_rare_plus + 1
      end,
      last_character_id = v_item_id,
      last_rarity = v_rarity,
      last_is_new = v_is_new,
      updated_at = timezone('utc', now())
  where user_id = v_uid;

  return app_private.gacha_snapshot(v_uid) || jsonb_build_object(
    'ok', true,
    'character_id', v_item_id,
    'rarity', v_rarity,
    'is_new', v_is_new,
    'copies', v_copies
  );
end;
$$;

create or replace function public.buy_gacha_weekly(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_owned_before integer := 0;
  v_is_new boolean;
  v_points jsonb;
  v_copies integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if p_item_id is null or btrim(p_item_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'not_featured');
  end if;

  select f.item_id, f.rarity, f.price
    into v_row
  from app_private.gacha_weekly_featured() f
  where f.item_id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_featured');
  end if;
  if v_row.price is null or v_row.price < 1 then
    return jsonb_build_object('ok', false, 'error', 'not_featured');
  end if;

  perform app_private.ensure_shop_account(v_uid);
  perform app_private.ensure_gacha_state(v_uid);
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('shop_points'));

  select coalesce(balance, 0) into v_owned_before
  from public.user_point_balances
  where user_id = v_uid;
  if coalesce(v_owned_before, 0) < v_row.price then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, 'buy_gacha_weekly', 10, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  begin
    v_points := app_private.apply_point_transaction(
      v_uid,
      -v_row.price,
      'gacha_weekly',
      'gacha_weekly:' || app_private.gacha_week_key() || ':' || gen_random_uuid()::text,
      jsonb_build_object('item_id', v_row.item_id, 'price', v_row.price)
    );
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end;

  if not coalesce((v_points ->> 'applied')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
  end if;

  select coalesce(copies, 0) into v_owned_before
  from public.user_gacha_copies
  where user_id = v_uid and item_id = v_row.item_id;

  v_is_new := v_owned_before < 1;
  v_copies := app_private.grant_gacha_copy(v_uid, v_row.item_id);

  update public.user_gacha_state
  set last_character_id = v_row.item_id,
      last_rarity = v_row.rarity,
      last_is_new = v_is_new,
      updated_at = timezone('utc', now())
  where user_id = v_uid;

  return app_private.gacha_snapshot(v_uid) || jsonb_build_object(
    'ok', true,
    'character_id', v_row.item_id,
    'rarity', v_row.rarity,
    'is_new', v_is_new,
    'copies', v_copies
  );
end;
$$;

create or replace function public.exchange_gacha_copies(p_source_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.shop_items%rowtype;
  v_copies integer := 0;
  v_source_rarity text;
  v_target_rarity text;
  v_reward_id text;
  v_owned_before integer := 0;
  v_is_new boolean;
  v_equipped text;
  v_remaining integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if p_source_id in ('avatar_default_female', 'avatar_default_male') then
    return jsonb_build_object('ok', false, 'error', 'starter_locked');
  end if;

  perform app_private.ensure_shop_account(v_uid);
  perform app_private.ensure_gacha_state(v_uid);
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('shop_points'));

  select * into v_source
  from public.shop_items
  where id = p_source_id and active and item_type = 'avatar';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select copies into v_copies
  from public.user_gacha_copies
  where user_id = v_uid and item_id = p_source_id
  for update;
  if coalesce(v_copies, 0) < 5 then
    return jsonb_build_object('ok', false, 'error', 'not_enough_copies');
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, 'exchange_gacha_copies', 20, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_source_rarity := app_private.gacha_band(v_source.rarity);
  v_target_rarity := case v_source_rarity
    when 'common' then 'rare'
    when 'rare' then 'epic'
    when 'epic' then 'legendary'
    else 'legendary'
  end;

  v_reward_id := app_private.gacha_pick_id(v_target_rarity, p_source_id);
  if v_reward_id is null then
    return jsonb_build_object('ok', false, 'error', 'empty_pool');
  end if;

  v_remaining := v_copies - 5;
  if v_remaining < 1 then
    delete from public.user_gacha_copies
    where user_id = v_uid and item_id = p_source_id;
    delete from public.user_shop_entitlements
    where user_id = v_uid and item_id = p_source_id;
    select equipped_item_id into v_equipped
    from public.user_avatar_profiles
    where user_id = v_uid;
    if v_equipped = p_source_id then
      update public.user_avatar_profiles
      set equipped_item_id = 'avatar_default_female',
          updated_at = timezone('utc', now())
      where user_id = v_uid;
    end if;
  else
    update public.user_gacha_copies
    set copies = v_remaining,
        updated_at = timezone('utc', now())
    where user_id = v_uid and item_id = p_source_id;
  end if;

  select coalesce(copies, 0) into v_owned_before
  from public.user_gacha_copies
  where user_id = v_uid and item_id = v_reward_id;

  v_is_new := v_owned_before < 1;
  perform app_private.grant_gacha_copy(v_uid, v_reward_id);

  update public.user_gacha_state
  set last_character_id = v_reward_id,
      last_rarity = app_private.gacha_band((
        select si.rarity from public.shop_items si where si.id = v_reward_id
      )),
      last_is_new = v_is_new,
      updated_at = timezone('utc', now())
  where user_id = v_uid;

  return app_private.gacha_snapshot(v_uid) || jsonb_build_object(
    'ok', true,
    'character_id', v_reward_id,
    'rarity', app_private.gacha_band((
      select si.rarity from public.shop_items si where si.id = v_reward_id
    )),
    'is_new', v_is_new
  );
end;
$$;

create or replace function public.purchase_shop_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.shop_items%rowtype;
  v_points jsonb;
  v_current_level smallint := 0;
  v_balance integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('shop_points'));

  select * into v_item
  from public.shop_items
  where id = p_item_id
    and active
    and item_type in ('avatar', 'theme', 'avatar_stage', 'avatar_awakening');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_item.item_type = 'avatar' then
    return jsonb_build_object('ok', false, 'error', 'gacha_only');
  end if;

  if v_item.item_type = 'avatar_awakening' then
    if v_item.parent_item_id is null or v_item.awakening_tier is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    if not exists (
      select 1
      from public.user_shop_entitlements ent
      join public.shop_items si on si.id = ent.item_id
      where ent.user_id = v_uid
        and ent.item_id = v_item.parent_item_id
        and si.active
        and si.item_type = 'avatar'
    ) and not exists (
      select 1
      from public.shop_items si
      where si.id = v_item.parent_item_id
        and si.active
        and si.item_type = 'avatar'
        and si.id in ('avatar_default_female', 'avatar_default_male')
    ) then
      return jsonb_build_object('ok', false, 'error', 'parent_not_owned');
    end if;

    select coalesce(uaa.level, 0) into v_current_level
    from (select 1) _
    left join public.user_avatar_awakenings uaa
      on uaa.user_id = v_uid and uaa.avatar_item_id = v_item.parent_item_id;

    if v_current_level >= v_item.awakening_tier then
      insert into public.user_shop_entitlements (user_id, item_id)
      values (v_uid, v_item.id)
      on conflict (user_id, item_id) do nothing;
      return jsonb_build_object('ok', false, 'error', 'already_owned');
    end if;

    if v_item.awakening_tier = 2 and v_current_level < 1 then
      return jsonb_build_object('ok', false, 'error', 'requires_awakening_i');
    end if;
  elsif exists (
    select 1 from public.user_shop_entitlements
    where user_id = v_uid and item_id = v_item.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  elsif v_item.price = 0 then
    insert into public.user_shop_entitlements (user_id, item_id)
    values (v_uid, v_item.id)
    on conflict (user_id, item_id) do nothing;

    select coalesce(balance, 0) into v_balance
    from public.user_point_balances
    where user_id = v_uid;

    return jsonb_build_object(
      'ok', true,
      'item_id', v_item.id,
      'balance', coalesce(v_balance, 0)
    );
  end if;

  if exists (
    select 1 from public.user_shop_entitlements
    where user_id = v_uid and item_id = v_item.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  begin
    v_points := app_private.apply_point_transaction(
      v_uid,
      -v_item.price,
      'shop_purchase',
      v_item.id,
      jsonb_build_object(
        'item_id', v_item.id,
        'price', v_item.price,
        'item_type', v_item.item_type,
        'parent_item_id', v_item.parent_item_id,
        'awakening_tier', v_item.awakening_tier
      )
    );
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end;

  if not coalesce((v_points ->> 'applied')::boolean, false) then
    if exists (
      select 1 from public.user_shop_entitlements
      where user_id = v_uid and item_id = v_item.id
    ) then
      return jsonb_build_object(
        'ok', true,
        'item_id', v_item.id,
        'balance', coalesce((v_points ->> 'balance')::integer, 0),
        'awakening_level', case
          when v_item.item_type = 'avatar_awakening' then v_item.awakening_tier
          else null
        end,
        'parent_item_id', v_item.parent_item_id
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
  end if;

  insert into public.user_shop_entitlements (user_id, item_id)
  values (v_uid, v_item.id)
  on conflict (user_id, item_id) do nothing;

  if v_item.item_type = 'avatar_awakening' then
    insert into public.user_avatar_awakenings (user_id, avatar_item_id, level, updated_at)
    values (v_uid, v_item.parent_item_id, v_item.awakening_tier, timezone('utc', now()))
    on conflict (user_id, avatar_item_id) do update set
      level = greatest(public.user_avatar_awakenings.level, excluded.level),
      updated_at = timezone('utc', now());
  end if;

  return jsonb_build_object(
    'ok', true,
    'item_id', v_item.id,
    'balance', coalesce((v_points ->> 'balance')::integer, 0),
    'awakening_level', case
      when v_item.item_type = 'avatar_awakening' then v_item.awakening_tier
      else null
    end,
    'parent_item_id', v_item.parent_item_id
  );
end;
$$;

comment on function public.get_gacha_state() is
  'Read-only banner snapshot. Guests see featured skins; mutations still require auth.';
comment on function public.pull_gacha() is
  'Authenticated: spend 400 points for one server-rolled pull. No client RNG.';
comment on function public.buy_gacha_weekly(text) is
  'Authenticated: buy this week''s featured skin at the server price. Pity unchanged.';
comment on function public.exchange_gacha_copies(text) is
  'Authenticated: spend 5 copies for a higher-rarity roll. No points and no pity change.';
comment on function public.purchase_shop_item(text) is
  'Purchase stages/themes. Avatars cannot be catalog-bought, including free claims.';

revoke all on function app_private.ensure_gacha_state(uuid) from public, anon, authenticated;
revoke all on function app_private.gacha_week_key(timestamptz) from public, anon, authenticated;
revoke all on function app_private.gacha_weekly_price(text) from public, anon, authenticated;
revoke all on function app_private.gacha_band(text) from public, anon, authenticated;
revoke all on function app_private.gacha_pick_id(text, text) from public, anon, authenticated;
revoke all on function app_private.gacha_weekly_featured(timestamptz) from public, anon, authenticated;
revoke all on function app_private.gacha_owned_json(uuid) from public, anon, authenticated;
revoke all on function app_private.grant_gacha_copy(uuid, text) from public, anon, authenticated;
revoke all on function app_private.gacha_snapshot(uuid) from public, anon, authenticated;
revoke all on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;

revoke all on function public.get_gacha_state() from public;
grant execute on function public.get_gacha_state() to anon, authenticated, service_role;

revoke all on function public.pull_gacha() from public, anon;
grant execute on function public.pull_gacha() to authenticated, service_role;

revoke all on function public.buy_gacha_weekly(text) from public, anon;
grant execute on function public.buy_gacha_weekly(text) to authenticated, service_role;

revoke all on function public.exchange_gacha_copies(text) from public, anon;
grant execute on function public.exchange_gacha_copies(text) to authenticated, service_role;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated, service_role;
