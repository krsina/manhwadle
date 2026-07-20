-- Purchasable Style A avatar stage backgrounds (homepage equip + shop Backgrounds tab).
-- Additive: widens item_type, seeds stages, equipped_stage_id, get/equip/purchase/account RPCs.

-- ---------------------------------------------------------------------------
-- Schema: avatar_stage item type + equipped_stage_id
-- ---------------------------------------------------------------------------

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in ('avatar', 'theme', 'avatar_part', 'avatar_stage'));

alter table public.user_avatar_profiles
  add column if not exists equipped_stage_id text;

update public.user_avatar_profiles
set equipped_stage_id = 'stage_blossom_courtyard'
where equipped_stage_id is null;

-- Seed stages before FK (ids must exist).
insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('stage_blossom_courtyard', 'avatar_stage', null, 'Blossom Courtyard',
   'Murim courtyard with blossom trees and a clear stone path.',
   0, 'common', 'stage_blossom_courtyard', 10, true),
  ('stage_sky_meadow', 'avatar_stage', null, 'Sky Meadow',
   'Pastoral meadow under a bright pixel sky.',
   100, 'rare', 'stage_sky_meadow', 20, true),
  ('stage_dusk_plaza', 'avatar_stage', null, 'Dusk Plaza',
   'Quiet dusk plaza with warm shop-window glow.',
   100, 'rare', 'stage_dusk_plaza', 30, true)
on conflict (id) do update set
  item_type = excluded.item_type,
  slot = excluded.slot,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  rarity = excluded.rarity,
  asset_key = excluded.asset_key,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = timezone('utc', now());

alter table public.user_avatar_profiles
  alter column equipped_stage_id set default 'stage_blossom_courtyard';

alter table public.user_avatar_profiles
  alter column equipped_stage_id set not null;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_avatar_profiles_equipped_stage_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_equipped_stage_id_fkey
      foreign key (equipped_stage_id) references public.shop_items(id) on delete restrict;
  end if;
end;
$fk$;

-- ---------------------------------------------------------------------------
-- ensure_shop_account: also grant free stages + default stage equip
-- ---------------------------------------------------------------------------

create or replace function app_private.ensure_shop_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_defaults record;
begin
  if p_user_id is null then
    return;
  end if;

  select * into v_defaults from app_private.default_avatar_loadout_ids();

  insert into public.user_point_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- Free whole-character starters (price = 0). Idempotent; never charges.
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar'
    and si.active
    and si.price = 0
  on conflict (user_id, item_id) do nothing;

  -- Free avatar stages (price = 0).
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar_stage'
    and si.active
    and si.price = 0
  on conflict (user_id, item_id) do nothing;

  -- Legacy starter entitlement retained for historical compatibility.
  insert into public.user_shop_entitlements (user_id, item_id)
  values (p_user_id, 'avatar_sora')
  on conflict (user_id, item_id) do nothing;

  insert into public.user_avatar_profiles (
    user_id,
    equipped_item_id,
    equipped_stage_id,
    body_id,
    skin_id,
    face_id,
    ears_id,
    hair_id,
    headwear_id,
    top_id,
    bottom_id,
    shoes_id,
    accessory_id,
    weapon_id
  ) values (
    p_user_id,
    'avatar_default_female',
    'stage_blossom_courtyard',
    v_defaults.body_id,
    v_defaults.skin_id,
    v_defaults.face_id,
    v_defaults.ears_id,
    v_defaults.hair_id,
    v_defaults.headwear_id,
    v_defaults.top_id,
    v_defaults.bottom_id,
    v_defaults.shoes_id,
    v_defaults.accessory_id,
    v_defaults.weapon_id
  )
  on conflict (user_id) do nothing;

  update public.user_avatar_profiles uap
  set body_id = coalesce(uap.body_id, v_defaults.body_id),
      skin_id = coalesce(uap.skin_id, v_defaults.skin_id),
      face_id = coalesce(uap.face_id, v_defaults.face_id),
      hair_id = coalesce(uap.hair_id, v_defaults.hair_id),
      top_id = coalesce(uap.top_id, v_defaults.top_id),
      bottom_id = coalesce(uap.bottom_id, v_defaults.bottom_id),
      shoes_id = coalesce(uap.shoes_id, v_defaults.shoes_id),
      equipped_stage_id = coalesce(uap.equipped_stage_id, 'stage_blossom_courtyard'),
      updated_at = timezone('utc', now())
  where uap.user_id = p_user_id
    and (
      uap.body_id is null
      or uap.skin_id is null
      or uap.face_id is null
      or uap.hair_id is null
      or uap.top_id is null
      or uap.bottom_id is null
      or uap.shoes_id is null
      or uap.equipped_stage_id is null
    );
end;
$$;

-- Backfill free stage entitlements + default stage for existing profiles.
do $backfill$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.user_point_balances
    union
    select user_id from public.user_avatar_profiles
    union
    select user_id from public.user_shop_entitlements
  loop
    perform app_private.ensure_shop_account(v_user);
  end loop;

  update public.user_avatar_profiles
  set equipped_stage_id = 'stage_blossom_courtyard',
      updated_at = timezone('utc', now())
  where equipped_stage_id is distinct from 'stage_blossom_courtyard'
    and not exists (
      select 1 from public.user_shop_entitlements ent
      where ent.user_id = user_avatar_profiles.user_id
        and ent.item_id = user_avatar_profiles.equipped_stage_id
    );
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- get_avatar_shop: avatars + stages
-- ---------------------------------------------------------------------------

create or replace function public.get_avatar_shop()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
  v_equipped text := 'avatar_default_female';
  v_equipped_stage text := 'stage_blossom_courtyard';
  v_items jsonb;
  v_stages jsonb;
begin
  if v_uid is not null then
    perform app_private.ensure_shop_account(v_uid);
    select balance into v_balance
    from public.user_point_balances
    where user_id = v_uid;
    select equipped_item_id, equipped_stage_id
      into v_equipped, v_equipped_stage
    from public.user_avatar_profiles
    where user_id = v_uid;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', si.id,
        'name', si.name,
        'description', si.description,
        'price', si.price,
        'rarity', si.rarity,
        'asset_key', si.asset_key,
        'owned', (
          v_uid is not null
          and (
            si.price = 0
            or exists (
              select 1
              from public.user_shop_entitlements ent
              where ent.user_id = v_uid and ent.item_id = si.id
            )
          )
        ),
        'equipped', (
          v_uid is not null
          and si.id = v_equipped
        )
      )
      order by si.sort_order, si.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.shop_items si
  where si.active and si.item_type = 'avatar';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', si.id,
        'name', si.name,
        'description', si.description,
        'price', si.price,
        'rarity', si.rarity,
        'asset_key', si.asset_key,
        'owned', (
          v_uid is not null
          and (
            si.price = 0
            or exists (
              select 1
              from public.user_shop_entitlements ent
              where ent.user_id = v_uid and ent.item_id = si.id
            )
          )
        ),
        'equipped', (
          v_uid is not null
          and si.id = coalesce(v_equipped_stage, 'stage_blossom_courtyard')
        )
      )
      order by si.sort_order, si.id
    ),
    '[]'::jsonb
  )
  into v_stages
  from public.shop_items si
  where si.active and si.item_type = 'avatar_stage';

  return jsonb_build_object(
    'ok', true,
    'authenticated', v_uid is not null,
    'balance', coalesce(v_balance, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female'),
    'equipped_stage_id', coalesce(v_equipped_stage, 'stage_blossom_courtyard'),
    'items', v_items,
    'stages', v_stages
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- purchase_shop_item: allow avatar_stage
-- ---------------------------------------------------------------------------

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
    and item_type in ('avatar', 'theme', 'avatar_stage');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_item.price = 0 or exists (
    select 1 from public.user_shop_entitlements
    where user_id = v_uid and item_id = v_item.id
  ) then
    insert into public.user_shop_entitlements (user_id, item_id)
    values (v_uid, v_item.id)
    on conflict (user_id, item_id) do nothing;
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
        'item_type', v_item.item_type
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
        'balance', coalesce((v_points ->> 'balance')::integer, 0)
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
  end if;

  insert into public.user_shop_entitlements (user_id, item_id)
  values (v_uid, v_item.id)
  on conflict (user_id, item_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'item_id', v_item.id,
    'balance', coalesce((v_points ->> 'balance')::integer, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- equip_stage
-- ---------------------------------------------------------------------------

create or replace function public.equip_stage(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);

  if not exists (
    select 1
    from public.shop_items si
    where si.id = p_item_id
      and si.active
      and si.item_type = 'avatar_stage'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not exists (
    select 1
    from public.user_shop_entitlements ent
    join public.shop_items si on si.id = ent.item_id
    where ent.user_id = v_uid
      and ent.item_id = p_item_id
      and si.active
      and si.item_type = 'avatar_stage'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_owned');
  end if;

  update public.user_avatar_profiles
  set equipped_stage_id = p_item_id,
      updated_at = timezone('utc', now())
  where user_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_unavailable');
  end if;

  select balance into v_balance
  from public.user_point_balances
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'equipped_stage_id', p_item_id,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_account: include equipped_stage_id (preserve lifetime_earned)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_account()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.public_profiles%rowtype;
  v_settings public.user_settings%rowtype;
  v_next timestamptz;
  v_role text;
  v_banned boolean;
  v_balance integer := 0;
  v_lifetime integer := 0;
  v_equipped text := 'avatar_default_female';
  v_equipped_stage text := 'stage_blossom_courtyard';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;
  perform app_private.ensure_shop_account(v_uid);

  select * into v_profile from public.public_profiles where user_id = v_uid;
  select * into v_settings from public.user_settings where user_id = v_uid;
  select balance, lifetime_earned
    into v_balance, v_lifetime
  from public.user_point_balances
  where user_id = v_uid;
  select equipped_item_id, equipped_stage_id
    into v_equipped, v_equipped_stage
  from public.user_avatar_profiles where user_id = v_uid;
  v_role := app_private.staff_role(v_uid);
  v_banned := app_private.is_cloud_banned(v_uid);

  v_next := case
    when v_profile.username_changed_at is null then null
    else v_profile.username_changed_at + interval '30 days'
  end;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'username', v_profile.username,
    'username_normalized', v_profile.username_normalized,
    'username_change_required', coalesce(v_profile.username_change_required, false),
    'needs_username', (
      v_profile.user_id is null
      or v_profile.username is null
      or coalesce(v_profile.username_change_required, false)
    ),
    'username_changed_at', v_profile.username_changed_at,
    'next_change_at', v_next,
    'can_change_username', (
      not v_banned
      and v_profile.username is not null
      and not coalesce(v_profile.username_change_required, false)
      and (
        v_profile.username_changed_at is null
        or v_profile.username_changed_at <= (timezone('utc', now()) - interval '30 days')
      )
    ),
    'reader_taste', v_settings.reader_taste,
    'leaderboard_visible', true,
    'staff_role', v_role,
    'cloud_banned', v_banned,
    'leaderboard_excluded', app_private.is_leaderboard_excluded(v_uid),
    'can_appear_publicly', app_private.can_appear_publicly(v_uid),
    'points_balance', coalesce(v_balance, 0),
    'lifetime_earned', coalesce(v_lifetime, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female'),
    'equipped_stage_id', coalesce(v_equipped_stage, 'stage_blossom_courtyard')
  );
end;
$$;

revoke all on function app_private.ensure_shop_account(uuid) from public, anon, authenticated;

revoke all on function public.get_avatar_shop() from public;
grant execute on function public.get_avatar_shop() to anon, authenticated, service_role;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated, service_role;

revoke all on function public.equip_stage(text) from public, anon;
grant execute on function public.equip_stage(text) to authenticated, service_role;

revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated, service_role;

comment on function public.get_avatar_shop() is
  'Returns active Style A avatars + stages, balance, equipped_avatar_id, and equipped_stage_id.';
comment on function public.equip_stage(text) is
  'Equips an owned avatar_stage onto the caller profile.';
comment on function public.get_my_account() is
  'Returns profile, wallet, equipped whole-character avatar id, and equipped stage id.';
