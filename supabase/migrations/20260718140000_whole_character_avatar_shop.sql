-- Whole-character Style A avatar shop.
-- Cutover from layered Style C avatar_part loadouts back to complete avatar products.
-- NEVER deletes shop items, entitlements, balances, ledger, or legacy avatar rows.
-- Loadout columns on user_avatar_profiles are retained but unused by public RPCs.

-- ---------------------------------------------------------------------------
-- Seed Style A whole-character catalog (ids + asset_key match client)
-- ---------------------------------------------------------------------------

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_default_female', 'avatar', null, 'Default (Female)',
   'A plain starter look',
   0, 'common', 'avatar_default_female', 10, true),
  ('avatar_default_male', 'avatar', null, 'Default (Male)',
   'A plain starter look',
   0, 'common', 'avatar_default_male', 20, true),
  ('avatar_shadow_hunter', 'avatar', null, 'Shadow Hunter',
   'Dual daggers, glowing cyan eyes, and a jagged shadow aura.',
   150, 'rare', 'avatar_shadow_hunter', 30, true),
  ('avatar_skybreaker_monk', 'avatar', null, 'Skybreaker Monk',
   'A tiger-wrapped brawler with a swirling forehead circlet.',
   150, 'rare', 'avatar_skybreaker_monk', 40, true)
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

-- Deactivate every layered avatar_part (retain rows for ledger/FK provenance).
update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where item_type = 'avatar_part';

-- Deactivate legacy gen-1 whole avatars not in the Style A catalog (no DELETE).
update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where item_type = 'avatar'
  and id not in (
    'avatar_default_female',
    'avatar_default_male',
    'avatar_shadow_hunter',
    'avatar_skybreaker_monk'
  );

-- ---------------------------------------------------------------------------
-- ensure_shop_account: free whole-character defaults + legacy sora entitlement
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

  -- Legacy starter entitlement retained for historical compatibility.
  insert into public.user_shop_entitlements (user_id, item_id)
  values (p_user_id, 'avatar_sora')
  on conflict (user_id, item_id) do nothing;

  -- New profiles only: Style A default equip + Style C loadout column defaults
  -- so NOT NULL constraints on retained loadout columns still hold.
  insert into public.user_avatar_profiles (
    user_id,
    equipped_item_id,
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

  -- Existing profiles: fill only missing required loadout columns; never wipe.
  update public.user_avatar_profiles uap
  set body_id = coalesce(uap.body_id, v_defaults.body_id),
      skin_id = coalesce(uap.skin_id, v_defaults.skin_id),
      face_id = coalesce(uap.face_id, v_defaults.face_id),
      hair_id = coalesce(uap.hair_id, v_defaults.hair_id),
      top_id = coalesce(uap.top_id, v_defaults.top_id),
      bottom_id = coalesce(uap.bottom_id, v_defaults.bottom_id),
      shoes_id = coalesce(uap.shoes_id, v_defaults.shoes_id),
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
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: grant free Style A entitlements + equip default female for all
-- ---------------------------------------------------------------------------

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
  set equipped_item_id = 'avatar_default_female',
      updated_at = timezone('utc', now())
  where equipped_item_id is distinct from 'avatar_default_female';
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- Public RPCs: whole-character catalog (no loadout field)
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
  v_items jsonb;
begin
  if v_uid is not null then
    perform app_private.ensure_shop_account(v_uid);
    select balance into v_balance
    from public.user_point_balances
    where user_id = v_uid;
    select equipped_item_id into v_equipped
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

  return jsonb_build_object(
    'ok', true,
    'authenticated', v_uid is not null,
    'balance', coalesce(v_balance, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female'),
    'items', v_items
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
    and item_type in ('avatar', 'theme');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Free catalog rows are always considered owned; paid rows need an entitlement.
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
    -- Idempotent replay: prior spend already recorded.
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

-- Thin wrapper: keep working for avatar-type purchases.
create or replace function public.purchase_avatar(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
begin
  return public.purchase_shop_item(p_item_id);
end;
$$;

create or replace function public.equip_avatar(p_item_id text)
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
      and si.item_type = 'avatar'
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
      and si.item_type = 'avatar'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_owned');
  end if;

  update public.user_avatar_profiles
  set equipped_item_id = p_item_id,
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
    'equipped_avatar_id', p_item_id,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

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
  v_equipped text := 'avatar_default_female';
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
  select balance into v_balance from public.user_point_balances where user_id = v_uid;
  select equipped_item_id into v_equipped
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
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female')
  );
end;
$$;

create or replace function public.export_shop_account(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
  select jsonb_build_object(
    'wallet', (
      select to_jsonb(upb) from public.user_point_balances upb where upb.user_id = p_user_id
    ),
    'entitlements', coalesce((
      select jsonb_agg(to_jsonb(ent) order by ent.acquired_at)
      from public.user_shop_entitlements ent where ent.user_id = p_user_id
    ), '[]'::jsonb),
    'avatar_profile', (
      select to_jsonb(uap) from public.user_avatar_profiles uap where uap.user_id = p_user_id
    ),
    'point_transactions', coalesce((
      select jsonb_agg(to_jsonb(pt) order by pt.created_at)
      from app_private.point_transactions pt where pt.user_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

-- Stub: layered loadouts are disabled; keep the function so old clients fail safely.
create or replace function public.save_avatar_loadout(p_loadout jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
begin
  return jsonb_build_object('ok', false, 'error', 'loadout_disabled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants / revokes
-- ---------------------------------------------------------------------------

revoke all on function app_private.ensure_shop_account(uuid) from public, anon, authenticated;

revoke all on function public.get_avatar_shop() from public;
grant execute on function public.get_avatar_shop() to anon, authenticated, service_role;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated, service_role;

revoke all on function public.purchase_avatar(text) from public, anon;
grant execute on function public.purchase_avatar(text) to authenticated, service_role;

revoke all on function public.equip_avatar(text) from public, anon;
grant execute on function public.equip_avatar(text) to authenticated, service_role;

revoke all on function public.save_avatar_loadout(jsonb) from public, anon;
grant execute on function public.save_avatar_loadout(jsonb) to authenticated, service_role;

revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated, service_role;

revoke all on function public.export_shop_account(uuid) from public, anon, authenticated;
grant execute on function public.export_shop_account(uuid) to service_role;

comment on function public.get_avatar_shop() is
  'Returns the active whole-character avatar catalog plus caller-owned and equipped state.';
comment on function public.purchase_shop_item(text) is
  'Atomically spends points and grants a shop entitlement (avatars or themes).';
comment on function public.equip_avatar(text) is
  'Equips an active whole-character avatar already owned by the authenticated caller.';
comment on function public.save_avatar_loadout(jsonb) is
  'Stub: layered avatar loadouts are disabled after the Style A whole-character cutover.';
comment on function public.export_shop_account(uuid) is
  'Service-role export of wallet, entitlements, avatar profile, and ledger.';
comment on function public.get_my_account() is
  'Returns account identity, moderation flags, points balance, and equipped whole-character avatar id.';
