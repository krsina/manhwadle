-- Style C 11-slot avatar catalog + loadouts.
-- Additive evolution of 20260718120000_layered_avatar_loadouts.sql.
-- Replaces SVG-era part IDs with Style C PNG starters; preserves economy/theme tables,
-- entitlements, ledger rows, and legacy monolithic avatar product rows.

-- ---------------------------------------------------------------------------
-- Catalog: expand shop_items slot check to the full 11-slot contract
-- ---------------------------------------------------------------------------

alter table public.shop_items
  drop constraint if exists shop_items_slot_check;

alter table public.shop_items
  add constraint shop_items_slot_check
  check (
    slot is null
    or slot in (
      'body',
      'skin',
      'face',
      'ears',
      'hair',
      'headwear',
      'top',
      'bottom',
      'shoes',
      'accessory',
      'weapon'
    )
  );

-- ---------------------------------------------------------------------------
-- Seed / upsert Style C free starter parts (ids + asset_key match client)
-- ---------------------------------------------------------------------------

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('body_female_peach', 'avatar_part', 'body', 'Elf Female',
   'Peach Style C female body plate with shared anchors.', 0, 'starter', 'body_female_peach', 10, true),
  ('body_male_peach', 'avatar_part', 'body', 'Elf Male',
   'Peach Style C male body plate with shared anchors.', 0, 'starter', 'body_male_peach', 20, true),
  ('skin_peach', 'avatar_part', 'skin', 'Peach',
   'Warm peach tone baked into the starter body plates.', 0, 'starter', 'skin_peach', 110, true),
  ('face_elf_heterochromia', 'avatar_part', 'face', 'Heterochromia',
   'Elf face with mismatched eyes.', 0, 'starter', 'face_elf_heterochromia', 210, true),
  ('ears_elf_pointed', 'avatar_part', 'ears', 'Pointed Ears',
   'Classic elf ear tips.', 0, 'starter', 'ears_elf_pointed', 310, true),
  ('hair_mint_long', 'avatar_part', 'hair', 'Mint Cascade',
   'Long mint hair with separate back and front plates.', 0, 'starter', 'hair_mint_long', 410, true),
  ('headwear_bunny_hood', 'avatar_part', 'headwear', 'Bunny Hood',
   'Fluffy bunny hood with back and front plates.', 0, 'starter', 'headwear_bunny_hood', 510, true),
  ('top_sky_wrap', 'avatar_part', 'top', 'Sky Wrap',
   'Soft sky-blue wrap top.', 0, 'starter', 'top_sky_wrap', 610, true),
  ('bottom_sky_shorts', 'avatar_part', 'bottom', 'Sky Shorts',
   'Matching sky-blue shorts.', 0, 'starter', 'bottom_sky_shorts', 710, true),
  ('shoes_bare', 'avatar_part', 'shoes', 'Barefoot',
   'Transparent bare-foot plate (no footwear).', 0, 'starter', 'shoes_bare', 810, true)
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

-- ---------------------------------------------------------------------------
-- Profile columns: body (required after backfill), ears + headwear (optional)
-- ---------------------------------------------------------------------------

alter table public.user_avatar_profiles
  add column if not exists body_id text,
  add column if not exists ears_id text,
  add column if not exists headwear_id text;

-- ---------------------------------------------------------------------------
-- Private helpers: DROP/CREATE where return type or arity changes
-- ---------------------------------------------------------------------------

drop function if exists app_private.default_avatar_loadout_ids();
drop function if exists app_private.avatar_loadout_json(
  text, text, text, text, text, text, text, text
);
-- Prefer dropping any 11-arg overload too (idempotent re-run / partial apply).
drop function if exists app_private.avatar_loadout_json(
  text, text, text, text, text, text, text, text, text, text, text
);

create function app_private.default_avatar_loadout_ids()
returns table (
  body_id text,
  skin_id text,
  face_id text,
  ears_id text,
  hair_id text,
  headwear_id text,
  top_id text,
  bottom_id text,
  shoes_id text,
  accessory_id text,
  weapon_id text
)
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select
    'body_female_peach'::text,
    'skin_peach'::text,
    'face_elf_heterochromia'::text,
    'ears_elf_pointed'::text,
    'hair_mint_long'::text,
    'headwear_bunny_hood'::text,
    'top_sky_wrap'::text,
    'bottom_sky_shorts'::text,
    'shoes_bare'::text,
    null::text,
    null::text;
$$;

create function app_private.avatar_loadout_json(
  p_body_id text,
  p_skin_id text,
  p_face_id text,
  p_ears_id text,
  p_hair_id text,
  p_headwear_id text,
  p_top_id text,
  p_bottom_id text,
  p_shoes_id text,
  p_accessory_id text,
  p_weapon_id text
)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select jsonb_build_object(
    'body_id', p_body_id,
    'skin_id', p_skin_id,
    'face_id', p_face_id,
    'ears_id', to_jsonb(p_ears_id),
    'hair_id', p_hair_id,
    'headwear_id', to_jsonb(p_headwear_id),
    'top_id', p_top_id,
    'bottom_id', p_bottom_id,
    'shoes_id', p_shoes_id,
    'accessory_id', to_jsonb(p_accessory_id),
    'weapon_id', to_jsonb(p_weapon_id)
  );
$$;

-- validate_loadout_part signature unchanged; keep CREATE OR REPLACE.
create or replace function app_private.validate_loadout_part(
  p_user_id uuid,
  p_item_id text,
  p_expected_slot text,
  p_allow_null boolean
)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_item public.shop_items%rowtype;
begin
  if p_item_id is null or btrim(p_item_id) = '' then
    if p_allow_null then
      return null;
    end if;
    return 'invalid_loadout';
  end if;

  select * into v_item
  from public.shop_items
  where id = p_item_id
    and item_type = 'avatar_part'
    and active;

  if not found then
    return 'item_unavailable';
  end if;

  if v_item.slot is distinct from p_expected_slot then
    return 'invalid_slot';
  end if;

  if not app_private.owns_shop_item(p_user_id, p_item_id) then
    return 'not_owned';
  end if;

  return null;
end;
$$;

create or replace function app_private.validate_avatar_loadout(
  p_user_id uuid,
  p_loadout jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_body_id text;
  v_skin_id text;
  v_face_id text;
  v_ears_id text;
  v_hair_id text;
  v_headwear_id text;
  v_top_id text;
  v_bottom_id text;
  v_shoes_id text;
  v_accessory_id text;
  v_weapon_id text;
  v_err text;
begin
  if p_loadout is null or jsonb_typeof(p_loadout) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_loadout');
  end if;

  v_body_id := nullif(btrim(coalesce(p_loadout ->> 'body_id', '')), '');
  v_skin_id := nullif(btrim(coalesce(p_loadout ->> 'skin_id', '')), '');
  v_face_id := nullif(btrim(coalesce(p_loadout ->> 'face_id', '')), '');
  v_ears_id := nullif(btrim(coalesce(p_loadout ->> 'ears_id', '')), '');
  v_hair_id := nullif(btrim(coalesce(p_loadout ->> 'hair_id', '')), '');
  v_headwear_id := nullif(btrim(coalesce(p_loadout ->> 'headwear_id', '')), '');
  v_top_id := nullif(btrim(coalesce(p_loadout ->> 'top_id', '')), '');
  v_bottom_id := nullif(btrim(coalesce(p_loadout ->> 'bottom_id', '')), '');
  v_shoes_id := nullif(btrim(coalesce(p_loadout ->> 'shoes_id', '')), '');
  v_accessory_id := nullif(btrim(coalesce(p_loadout ->> 'accessory_id', '')), '');
  v_weapon_id := nullif(btrim(coalesce(p_loadout ->> 'weapon_id', '')), '');

  v_err := app_private.validate_loadout_part(p_user_id, v_body_id, 'body', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_skin_id, 'skin', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_face_id, 'face', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_ears_id, 'ears', true);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_hair_id, 'hair', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_headwear_id, 'headwear', true);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_top_id, 'top', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_bottom_id, 'bottom', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_shoes_id, 'shoes', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_accessory_id, 'accessory', true);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_weapon_id, 'weapon', true);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  return jsonb_build_object(
    'ok', true,
    'loadout', app_private.avatar_loadout_json(
      v_body_id,
      v_skin_id,
      v_face_id,
      v_ears_id,
      v_hair_id,
      v_headwear_id,
      v_top_id,
      v_bottom_id,
      v_shoes_id,
      v_accessory_id,
      v_weapon_id
    )
  );
end;
$$;

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

  -- Free starter parts (price = 0). Idempotent; never charges.
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar_part'
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
    'avatar_sora',
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

  -- Fill only missing required columns; optional slots stay as stored (incl. null).
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
-- One-time catalog cutover: every profile -> Style C female elf default
-- ---------------------------------------------------------------------------

do $cutover$
declare
  v_user uuid;
  v_defaults record;
begin
  select * into v_defaults from app_private.default_avatar_loadout_ids();

  for v_user in
    select user_id from public.user_point_balances
    union
    select user_id from public.user_avatar_profiles
    union
    select user_id from public.user_shop_entitlements
  loop
    perform app_private.ensure_shop_account(v_user);
  end loop;

  -- Explicit full replace of SVG-era loadouts (not coalesce).
  update public.user_avatar_profiles
  set body_id = v_defaults.body_id,
      skin_id = v_defaults.skin_id,
      face_id = v_defaults.face_id,
      ears_id = v_defaults.ears_id,
      hair_id = v_defaults.hair_id,
      headwear_id = v_defaults.headwear_id,
      top_id = v_defaults.top_id,
      bottom_id = v_defaults.bottom_id,
      shoes_id = v_defaults.shoes_id,
      accessory_id = v_defaults.accessory_id,
      weapon_id = v_defaults.weapon_id,
      updated_at = timezone('utc', now());
end;
$cutover$;

-- Tighten body_id after backfill (other new slots remain optional/nullable).
alter table public.user_avatar_profiles
  alter column body_id set default 'body_female_peach';

alter table public.user_avatar_profiles
  alter column body_id set not null;

-- Refresh required-column defaults to Style C IDs.
alter table public.user_avatar_profiles
  alter column skin_id set default 'skin_peach',
  alter column face_id set default 'face_elf_heterochromia',
  alter column hair_id set default 'hair_mint_long',
  alter column top_id set default 'top_sky_wrap',
  alter column bottom_id set default 'bottom_sky_shorts',
  alter column shoes_id set default 'shoes_bare';

do $fks$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_body_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_body_id_fkey
      foreign key (body_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_ears_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_ears_id_fkey
      foreign key (ears_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_headwear_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_headwear_id_fkey
      foreign key (headwear_id) references public.shop_items(id) on delete restrict;
  end if;
end;
$fks$;

-- Deactivate every prior SVG-era avatar_part not in the Style C starter set.
-- Never delete shop items, entitlements, balances, ledger, or legacy avatar rows.
update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where item_type = 'avatar_part'
  and id not in (
    'body_female_peach',
    'body_male_peach',
    'skin_peach',
    'face_elf_heterochromia',
    'ears_elf_pointed',
    'hair_mint_long',
    'headwear_bunny_hood',
    'top_sky_wrap',
    'bottom_sky_shorts',
    'shoes_bare'
  );

-- ---------------------------------------------------------------------------
-- Public RPCs (11-key snake_case loadout)
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
  v_equipped text := 'avatar_sora';
  v_profile public.user_avatar_profiles%rowtype;
  v_loadout jsonb;
  v_items jsonb;
  v_defaults record;
begin
  select * into v_defaults from app_private.default_avatar_loadout_ids();
  v_loadout := app_private.avatar_loadout_json(
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
  );

  if v_uid is not null then
    perform app_private.ensure_shop_account(v_uid);
    select balance into v_balance
    from public.user_point_balances
    where user_id = v_uid;
    select * into v_profile
    from public.user_avatar_profiles
    where user_id = v_uid;
    if found then
      v_equipped := v_profile.equipped_item_id;
      v_loadout := app_private.avatar_loadout_json(
        v_profile.body_id,
        v_profile.skin_id,
        v_profile.face_id,
        v_profile.ears_id,
        v_profile.hair_id,
        v_profile.headwear_id,
        v_profile.top_id,
        v_profile.bottom_id,
        v_profile.shoes_id,
        v_profile.accessory_id,
        v_profile.weapon_id
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', si.id,
        'slot', si.slot,
        'name', si.name,
        'description', si.description,
        'price', si.price,
        'rarity', si.rarity,
        'asset_key', si.asset_key,
        'owned', (
          v_uid is not null
          and app_private.owns_shop_item(v_uid, si.id)
        ),
        'equipped', (
          v_uid is not null
          and (
            (si.slot = 'body' and si.id = (v_loadout ->> 'body_id'))
            or (si.slot = 'skin' and si.id = (v_loadout ->> 'skin_id'))
            or (si.slot = 'face' and si.id = (v_loadout ->> 'face_id'))
            or (si.slot = 'ears' and si.id = (v_loadout ->> 'ears_id'))
            or (si.slot = 'hair' and si.id = (v_loadout ->> 'hair_id'))
            or (si.slot = 'headwear' and si.id = (v_loadout ->> 'headwear_id'))
            or (si.slot = 'top' and si.id = (v_loadout ->> 'top_id'))
            or (si.slot = 'bottom' and si.id = (v_loadout ->> 'bottom_id'))
            or (si.slot = 'shoes' and si.id = (v_loadout ->> 'shoes_id'))
            or (si.slot = 'accessory' and si.id = (v_loadout ->> 'accessory_id'))
            or (si.slot = 'weapon' and si.id = (v_loadout ->> 'weapon_id'))
          )
        )
      )
      order by si.sort_order, si.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.shop_items si
  where si.active and si.item_type = 'avatar_part';

  return jsonb_build_object(
    'ok', true,
    'authenticated', v_uid is not null,
    'balance', coalesce(v_balance, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_sora'),
    'loadout', v_loadout,
    'items', v_items
  );
end;
$$;

create or replace function public.save_avatar_loadout(p_loadout jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_validated jsonb;
  v_loadout jsonb;
  v_balance integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);

  v_validated := app_private.validate_avatar_loadout(v_uid, p_loadout);
  if not coalesce((v_validated ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_validated ->> 'error', 'invalid_loadout')
    );
  end if;

  v_loadout := v_validated -> 'loadout';

  update public.user_avatar_profiles
  set body_id = v_loadout ->> 'body_id',
      skin_id = v_loadout ->> 'skin_id',
      face_id = v_loadout ->> 'face_id',
      ears_id = case
        when jsonb_typeof(v_loadout -> 'ears_id') = 'null' then null
        else nullif(v_loadout ->> 'ears_id', '')
      end,
      hair_id = v_loadout ->> 'hair_id',
      headwear_id = case
        when jsonb_typeof(v_loadout -> 'headwear_id') = 'null' then null
        else nullif(v_loadout ->> 'headwear_id', '')
      end,
      top_id = v_loadout ->> 'top_id',
      bottom_id = v_loadout ->> 'bottom_id',
      shoes_id = v_loadout ->> 'shoes_id',
      accessory_id = case
        when jsonb_typeof(v_loadout -> 'accessory_id') = 'null' then null
        else nullif(v_loadout ->> 'accessory_id', '')
      end,
      weapon_id = case
        when jsonb_typeof(v_loadout -> 'weapon_id') = 'null' then null
        else nullif(v_loadout ->> 'weapon_id', '')
      end,
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
    'loadout', v_loadout,
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
  v_avatar public.user_avatar_profiles%rowtype;
  v_next timestamptz;
  v_role text;
  v_banned boolean;
  v_balance integer := 0;
  v_equipped text := 'avatar_sora';
  v_loadout jsonb;
  v_defaults record;
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
  select * into v_avatar from public.user_avatar_profiles where user_id = v_uid;
  v_role := app_private.staff_role(v_uid);
  v_banned := app_private.is_cloud_banned(v_uid);

  select * into v_defaults from app_private.default_avatar_loadout_ids();
  if v_avatar.user_id is not null then
    v_equipped := coalesce(v_avatar.equipped_item_id, 'avatar_sora');
    v_loadout := app_private.avatar_loadout_json(
      v_avatar.body_id,
      v_avatar.skin_id,
      v_avatar.face_id,
      v_avatar.ears_id,
      v_avatar.hair_id,
      v_avatar.headwear_id,
      v_avatar.top_id,
      v_avatar.bottom_id,
      v_avatar.shoes_id,
      v_avatar.accessory_id,
      v_avatar.weapon_id
    );
  else
    v_loadout := app_private.avatar_loadout_json(
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
    );
  end if;

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
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_sora'),
    'avatar_loadout', v_loadout
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
    'avatar_loadout', (
      select app_private.avatar_loadout_json(
        uap.body_id,
        uap.skin_id,
        uap.face_id,
        uap.ears_id,
        uap.hair_id,
        uap.headwear_id,
        uap.top_id,
        uap.bottom_id,
        uap.shoes_id,
        uap.accessory_id,
        uap.weapon_id
      )
      from public.user_avatar_profiles uap
      where uap.user_id = p_user_id
    ),
    'point_transactions', coalesce((
      select jsonb_agg(to_jsonb(pt) order by pt.created_at)
      from app_private.point_transactions pt where pt.user_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants / revokes (mirror layered migration patterns)
-- ---------------------------------------------------------------------------

revoke all on function app_private.default_avatar_loadout_ids() from public, anon, authenticated;
revoke all on function app_private.avatar_loadout_json(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function app_private.owns_shop_item(uuid, text) from public, anon, authenticated;
revoke all on function app_private.validate_loadout_part(
  uuid, text, text, boolean
) from public, anon, authenticated;
revoke all on function app_private.validate_avatar_loadout(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.ensure_shop_account(uuid) from public, anon, authenticated;

revoke all on function public.get_avatar_shop() from public;
grant execute on function public.get_avatar_shop() to anon, authenticated, service_role;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated, service_role;

revoke all on function public.save_avatar_loadout(jsonb) from public, anon;
grant execute on function public.save_avatar_loadout(jsonb) to authenticated, service_role;

revoke all on function public.purchase_avatar(text) from public, anon;
grant execute on function public.purchase_avatar(text) to authenticated, service_role;

revoke all on function public.equip_avatar(text) from public, anon;
grant execute on function public.equip_avatar(text) to authenticated, service_role;

revoke all on function public.export_shop_account(uuid) from public, anon, authenticated;
grant execute on function public.export_shop_account(uuid) to service_role;

comment on function public.get_avatar_shop() is
  'Returns active Style C avatar-part catalog plus caller 11-slot loadout, ownership, and balance.';
comment on function public.save_avatar_loadout(jsonb) is
  'Validates ownership and 11 slots, then persists the caller avatar loadout.';
comment on function public.export_shop_account(uuid) is
  'Service-role export of wallet, entitlements, avatar profile (incl. body/ears/headwear), 11-key loadout, and ledger.';
