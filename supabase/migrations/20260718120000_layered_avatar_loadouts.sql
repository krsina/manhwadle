-- Layered chibi avatar parts + validated loadouts.
-- Additive evolution of 20260718110000_avatar_shop_economy.sql (ledger/rewards unchanged).

-- ---------------------------------------------------------------------------
-- Catalog: part slots on shop_items
-- ---------------------------------------------------------------------------

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in ('avatar', 'theme', 'avatar_part'));

alter table public.shop_items
  add column if not exists slot text;

alter table public.shop_items
  drop constraint if exists shop_items_slot_check;

alter table public.shop_items
  add constraint shop_items_slot_check
  check (
    slot is null
    or slot in ('face', 'skin', 'hair', 'top', 'bottom', 'shoes', 'accessory', 'weapon')
  );

alter table public.shop_items
  drop constraint if exists shop_items_part_shape_check;

alter table public.shop_items
  add constraint shop_items_part_shape_check
  check (
    (
      item_type = 'avatar_part'
      and slot is not null
    )
    or (
      item_type <> 'avatar_part'
      and slot is null
    )
  );

create index if not exists shop_items_active_part_slot_idx
  on public.shop_items (slot, sort_order, id)
  where active and item_type = 'avatar_part';

-- ---------------------------------------------------------------------------
-- Seed layered catalog (ids aligned with client avatarComposition.ts)
-- asset_key uses item id for uniqueness; client maps art via part id meta.
-- ---------------------------------------------------------------------------

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  -- Universal face presets; every loadout uses the same body geometry.
  ('face_hunter', 'avatar_part', 'face', 'Shadow Hunter',
   'Sharp, focused eyes for night raids.', 0, 'starter', 'face_hunter', 10, true),
  ('face_swordsman', 'avatar_part', 'face', 'Regressor Blade',
   'A steady swordsman stare.', 0, 'starter', 'face_swordsman', 20, true),
  ('face_mage', 'avatar_part', 'face', 'Tower Adept',
   'Soft, inquisitive eyes suited to tower climbers.', 0, 'starter', 'face_mage', 30, true),

  -- Skins
  ('skin_ivory', 'avatar_part', 'skin', 'Ivory',
   'Fair cool-toned skin.', 0, 'starter', 'skin_ivory', 110, true),
  ('skin_peach', 'avatar_part', 'skin', 'Peach',
   'Warm peach default tone.', 0, 'starter', 'skin_peach', 120, true),
  ('skin_warm', 'avatar_part', 'skin', 'Warm Sand',
   'Golden mid-tone.', 0, 'starter', 'skin_warm', 130, true),
  ('skin_tan', 'avatar_part', 'skin', 'Tan',
   'Sun-touched tan.', 40, 'common', 'skin_tan', 140, true),
  ('skin_deep', 'avatar_part', 'skin', 'Deep Ember',
   'Rich deep complexion.', 40, 'common', 'skin_deep', 150, true),
  ('skin_cool', 'avatar_part', 'skin', 'Cool Rose',
   'Rosy cool undertone.', 40, 'common', 'skin_cool', 160, true),

  -- Hair
  ('hair_short_ink', 'avatar_part', 'hair', 'Ink Crop',
   'Short neat black crop.', 0, 'starter', 'hair_short_ink', 210, true),
  ('hair_messy_ash', 'avatar_part', 'hair', 'Ash Messy',
   'Tousled ash-brown layers.', 0, 'starter', 'hair_messy_ash', 220, true),
  ('hair_silver_spikes', 'avatar_part', 'hair', 'Silver Spikes',
   'Storm-silver spikes.', 70, 'common', 'hair_silver_spikes', 230, true),
  ('hair_long_violet', 'avatar_part', 'hair', 'Violet Cascade',
   'Long violet flow past the shoulders.', 70, 'common', 'hair_long_violet', 240, true),
  ('hair_bob_crimson', 'avatar_part', 'hair', 'Crimson Bob',
   'Sharp chin-length crimson bob.', 70, 'common', 'hair_bob_crimson', 250, true),
  ('hair_twin_moon', 'avatar_part', 'hair', 'Moon Twins',
   'Pale twin tails with side fringe.', 70, 'common', 'hair_twin_moon', 260, true),

  -- Tops
  ('top_plain_tee', 'avatar_part', 'top', 'Plain Tee',
   'Simple everyday tee.', 0, 'starter', 'top_plain_tee', 310, true),
  ('top_street_hoodie', 'avatar_part', 'top', 'Seoul Hoodie',
   'Korean streetwear hoodie.', 95, 'rare', 'top_street_hoodie', 320, true),
  ('top_hunter_coat', 'avatar_part', 'top', 'Hunter Coat',
   'Dark hunter trench with high collar.', 95, 'rare', 'top_hunter_coat', 330, true),
  ('top_academy_blazer', 'avatar_part', 'top', 'Academy Blazer',
   'Crisp academy uniform jacket.', 95, 'rare', 'top_academy_blazer', 340, true),
  ('top_cultivation_robe', 'avatar_part', 'top', 'Cultivation Robe',
   'Layered cultivation sleeves.', 95, 'rare', 'top_cultivation_robe', 350, true),
  ('top_dungeon_armor', 'avatar_part', 'top', 'Dungeon Plate',
   'Compact dungeon chest plate.', 95, 'rare', 'top_dungeon_armor', 360, true),

  -- Bottoms
  ('bottom_plain_pants', 'avatar_part', 'bottom', 'Plain Pants',
   'Simple fitted pants.', 0, 'starter', 'bottom_plain_pants', 410, true),
  ('bottom_cargo', 'avatar_part', 'bottom', 'Cargo Cut',
   'Street cargo pants.', 80, 'rare', 'bottom_cargo', 420, true),
  ('bottom_pleat', 'avatar_part', 'bottom', 'Academy Pleats',
   'Uniform pleated skirt.', 80, 'rare', 'bottom_pleat', 430, true),
  ('bottom_greaves', 'avatar_part', 'bottom', 'Raid Greaves',
   'Armored greaves for gate runs.', 80, 'rare', 'bottom_greaves', 440, true),

  -- Shoes
  ('shoes_basic', 'avatar_part', 'shoes', 'Basic Soles',
   'Everyday sneakers.', 0, 'starter', 'shoes_basic', 510, true),
  ('shoes_combat', 'avatar_part', 'shoes', 'Combat Boots',
   'Heavy hunter boots.', 55, 'common', 'shoes_combat', 520, true),
  ('shoes_soft', 'avatar_part', 'shoes', 'Soft Steps',
   'Quiet slip-ons.', 55, 'common', 'shoes_soft', 530, true),

  -- Accessories (optional; no free default row — null means unequipped)
  ('accessory_shadow_aura', 'avatar_part', 'accessory', 'Shadow Aura',
   'Soft violet aura behind the figure.', 110, 'epic', 'accessory_shadow_aura', 610, true),
  ('accessory_scar_mark', 'avatar_part', 'accessory', 'Gate Mark',
   'Cheek mark from a hard clear.', 110, 'epic', 'accessory_scar_mark', 620, true),
  ('accessory_glasses', 'avatar_part', 'accessory', 'Focus Specs',
   'Thin reading glasses.', 110, 'epic', 'accessory_glasses', 630, true),
  ('accessory_earring', 'avatar_part', 'accessory', 'Mana Stud',
   'Single glowing earring.', 110, 'epic', 'accessory_earring', 640, true),

  -- Weapons (optional)
  ('weapon_hunter_blade', 'avatar_part', 'weapon', 'Hunter Blade',
   'Oversized shadow-hunter sword.', 160, 'legendary', 'weapon_hunter_blade', 710, true),
  ('weapon_regressor_greatsword', 'avatar_part', 'weapon', 'Second Chance Edge',
   'Massive regressor greatsword.', 160, 'legendary', 'weapon_regressor_greatsword', 720, true),
  ('weapon_tower_staff', 'avatar_part', 'weapon', 'Floor Staff',
   'Tower mage staff with a crystal tip.', 160, 'legendary', 'weapon_tower_staff', 730, true),
  ('weapon_twin_daggers', 'avatar_part', 'weapon', 'Twin Fang Knives',
   'Paired daggers for speed clears.', 160, 'legendary', 'weapon_twin_daggers', 740, true)
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

-- Deactivate legacy complete-avatar products (retain rows for ledger/FK provenance).
update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where item_type = 'avatar'
  and id in (
    'avatar_sora', 'avatar_mina', 'avatar_ren', 'avatar_hana',
    'avatar_jun', 'avatar_yumi', 'avatar_dae', 'avatar_nari',
    'avatar_kai', 'avatar_ari', 'avatar_tae', 'avatar_sol'
  );

-- ---------------------------------------------------------------------------
-- Loadout columns on user_avatar_profiles (source of truth)
-- Keep equipped_item_id temporarily for old-field compatibility.
-- ---------------------------------------------------------------------------

alter table public.user_avatar_profiles
  add column if not exists face_id text,
  add column if not exists skin_id text,
  add column if not exists hair_id text,
  add column if not exists top_id text,
  add column if not exists bottom_id text,
  add column if not exists shoes_id text,
  add column if not exists accessory_id text,
  add column if not exists weapon_id text;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.default_avatar_loadout_ids()
returns table (
  face_id text,
  skin_id text,
  hair_id text,
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
    'face_hunter'::text,
    'skin_peach'::text,
    'hair_short_ink'::text,
    'top_plain_tee'::text,
    'bottom_plain_pants'::text,
    'shoes_basic'::text,
    null::text,
    null::text;
$$;

create or replace function app_private.avatar_loadout_json(
  p_face_id text,
  p_skin_id text,
  p_hair_id text,
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
    'face_id', p_face_id,
    'skin_id', p_skin_id,
    'hair_id', p_hair_id,
    'top_id', p_top_id,
    'bottom_id', p_bottom_id,
    'shoes_id', p_shoes_id,
    'accessory_id', to_jsonb(p_accessory_id),
    'weapon_id', to_jsonb(p_weapon_id)
  );
$$;

create or replace function app_private.owns_shop_item(p_user_id uuid, p_item_id text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_price integer;
begin
  if p_user_id is null or p_item_id is null or btrim(p_item_id) = '' then
    return false;
  end if;

  select price into v_price
  from public.shop_items
  where id = p_item_id;

  if not found then
    return false;
  end if;

  if v_price = 0 then
    return true;
  end if;

  return exists (
    select 1
    from public.user_shop_entitlements ent
    where ent.user_id = p_user_id and ent.item_id = p_item_id
  );
end;
$$;

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
  v_face_id text;
  v_skin_id text;
  v_hair_id text;
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

  v_face_id := nullif(btrim(coalesce(p_loadout ->> 'face_id', '')), '');
  v_skin_id := nullif(btrim(coalesce(p_loadout ->> 'skin_id', '')), '');
  v_hair_id := nullif(btrim(coalesce(p_loadout ->> 'hair_id', '')), '');
  v_top_id := nullif(btrim(coalesce(p_loadout ->> 'top_id', '')), '');
  v_bottom_id := nullif(btrim(coalesce(p_loadout ->> 'bottom_id', '')), '');
  v_shoes_id := nullif(btrim(coalesce(p_loadout ->> 'shoes_id', '')), '');
  v_accessory_id := nullif(btrim(coalesce(p_loadout ->> 'accessory_id', '')), '');
  v_weapon_id := nullif(btrim(coalesce(p_loadout ->> 'weapon_id', '')), '');

  v_err := app_private.validate_loadout_part(
    p_user_id, v_face_id, 'face', false
  );
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_skin_id, 'skin', false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_err := app_private.validate_loadout_part(p_user_id, v_hair_id, 'hair', false);
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
      v_face_id,
      v_skin_id,
      v_hair_id,
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
    face_id,
    skin_id,
    hair_id,
    top_id,
    bottom_id,
    shoes_id,
    accessory_id,
    weapon_id
  ) values (
    p_user_id,
    'avatar_sora',
    v_defaults.face_id,
    v_defaults.skin_id,
    v_defaults.hair_id,
    v_defaults.top_id,
    v_defaults.bottom_id,
    v_defaults.shoes_id,
    v_defaults.accessory_id,
    v_defaults.weapon_id
  )
  on conflict (user_id) do nothing;

  update public.user_avatar_profiles uap
  set face_id = coalesce(uap.face_id, v_defaults.face_id),
      skin_id = coalesce(uap.skin_id, v_defaults.skin_id),
      hair_id = coalesce(uap.hair_id, v_defaults.hair_id),
      top_id = coalesce(uap.top_id, v_defaults.top_id),
      bottom_id = coalesce(uap.bottom_id, v_defaults.bottom_id),
      shoes_id = coalesce(uap.shoes_id, v_defaults.shoes_id),
      updated_at = timezone('utc', now())
  where uap.user_id = p_user_id
    and (
      uap.face_id is null
      or uap.skin_id is null
      or uap.hair_id is null
      or uap.top_id is null
      or uap.bottom_id is null
      or uap.shoes_id is null
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotent backfill (no point charges)
-- ---------------------------------------------------------------------------

do $backfill$
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

  update public.user_avatar_profiles uap
  set face_id = coalesce(uap.face_id, v_defaults.face_id),
      skin_id = coalesce(uap.skin_id, v_defaults.skin_id),
      hair_id = coalesce(uap.hair_id, v_defaults.hair_id),
      top_id = coalesce(uap.top_id, v_defaults.top_id),
      bottom_id = coalesce(uap.bottom_id, v_defaults.bottom_id),
      shoes_id = coalesce(uap.shoes_id, v_defaults.shoes_id),
      updated_at = timezone('utc', now())
  where uap.face_id is null
     or uap.skin_id is null
     or uap.hair_id is null
     or uap.top_id is null
     or uap.bottom_id is null
     or uap.shoes_id is null;
end;
$backfill$;

-- Tighten required loadout columns after backfill.
alter table public.user_avatar_profiles
  alter column face_id set default 'face_hunter',
  alter column skin_id set default 'skin_peach',
  alter column hair_id set default 'hair_short_ink',
  alter column top_id set default 'top_plain_tee',
  alter column bottom_id set default 'bottom_plain_pants',
  alter column shoes_id set default 'shoes_basic';

alter table public.user_avatar_profiles
  alter column face_id set not null,
  alter column skin_id set not null,
  alter column hair_id set not null,
  alter column top_id set not null,
  alter column bottom_id set not null,
  alter column shoes_id set not null;

do $fks$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_face_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_face_id_fkey
      foreign key (face_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_skin_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_skin_id_fkey
      foreign key (skin_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_hair_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_hair_id_fkey
      foreign key (hair_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_top_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_top_id_fkey
      foreign key (top_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_bottom_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_bottom_id_fkey
      foreign key (bottom_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_shoes_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_shoes_id_fkey
      foreign key (shoes_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_accessory_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_accessory_id_fkey
      foreign key (accessory_id) references public.shop_items(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatar_profiles_weapon_id_fkey'
  ) then
    alter table public.user_avatar_profiles
      add constraint user_avatar_profiles_weapon_id_fkey
      foreign key (weapon_id) references public.shop_items(id) on delete restrict;
  end if;
end;
$fks$;

-- ---------------------------------------------------------------------------
-- Public RPCs
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
    v_defaults.face_id,
    v_defaults.skin_id,
    v_defaults.hair_id,
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
        v_profile.face_id,
        v_profile.skin_id,
        v_profile.hair_id,
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
            (si.slot = 'face' and si.id = (v_loadout ->> 'face_id'))
            or (si.slot = 'skin' and si.id = (v_loadout ->> 'skin_id'))
            or (si.slot = 'hair' and si.id = (v_loadout ->> 'hair_id'))
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
    and item_type in ('avatar_part', 'theme');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_unavailable');
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
        'slot', v_item.slot,
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
  set face_id = v_loadout ->> 'face_id',
      skin_id = v_loadout ->> 'skin_id',
      hair_id = v_loadout ->> 'hair_id',
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

-- Thin wrappers for temporary compatibility with older clients.
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
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);

  -- Legacy complete avatars are inactive; keep RPC for compatibility only.
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

  return jsonb_build_object('ok', true, 'equipped_avatar_id', p_item_id);
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
      v_avatar.face_id,
      v_avatar.skin_id,
      v_avatar.hair_id,
      v_avatar.top_id,
      v_avatar.bottom_id,
      v_avatar.shoes_id,
      v_avatar.accessory_id,
      v_avatar.weapon_id
    );
  else
    v_loadout := app_private.avatar_loadout_json(
      v_defaults.face_id,
      v_defaults.skin_id,
      v_defaults.hair_id,
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
        uap.face_id,
        uap.skin_id,
        uap.hair_id,
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
-- Grants / revokes
-- ---------------------------------------------------------------------------

revoke all on function app_private.default_avatar_loadout_ids() from public, anon, authenticated;
revoke all on function app_private.avatar_loadout_json(
  text, text, text, text, text, text, text, text
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
  'Returns active avatar-part catalog plus caller loadout, ownership, and balance.';
comment on function public.purchase_shop_item(text) is
  'Atomically spends points and grants a shop entitlement (avatar parts or themes).';
comment on function public.save_avatar_loadout(jsonb) is
  'Validates ownership and slots, then persists the caller avatar loadout.';
comment on function public.export_shop_account(uuid) is
  'Service-role export of wallet, entitlements, avatar profile/loadout, and ledger.';
