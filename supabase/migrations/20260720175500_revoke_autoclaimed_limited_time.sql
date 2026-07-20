-- Limited-time free claims must never be auto-granted.
-- Revoke any entitlements that slipped in via older ensure_shop_account(price=0)
-- (or equivalent), and clear equipment that depended on them.

-- ---------------------------------------------------------------------------
-- Unequip limited-time items before revoking entitlements
-- ---------------------------------------------------------------------------

update public.user_avatar_profiles
set equipped_item_id = 'avatar_default_female',
    updated_at = timezone('utc', now())
where equipped_item_id in ('avatar_quest_recruit', 'avatar_spark_apprentice');

update public.user_avatar_profiles
set equipped_stage_id = 'stage_blossom_courtyard',
    updated_at = timezone('utc', now())
where equipped_stage_id = 'stage_sky_meadow';

delete from public.user_shop_entitlements
where item_id in (
  'avatar_quest_recruit',
  'avatar_spark_apprentice',
  'stage_sky_meadow'
);

-- ---------------------------------------------------------------------------
-- ensure_shop_account: permanent free grants only (reassert)
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

  -- Permanent free starters only. Never grant limited-time claimables here.
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar'
    and si.active
    and si.id in ('avatar_default_female', 'avatar_default_male')
  on conflict (user_id, item_id) do nothing;

  -- Permanent free stage only. Never grant limited-time stages (e.g. Sky Meadow).
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar_stage'
    and si.active
    and si.id = 'stage_blossom_courtyard'
  on conflict (user_id, item_id) do nothing;

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

-- ---------------------------------------------------------------------------
-- get_avatar_shop: owned only via starter id or entitlement (never price=0 alone)
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
  v_equipped_awakening smallint := 0;
  v_items jsonb;
  v_stages jsonb;
  v_awakenings jsonb;
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
    select coalesce(uaa.level, 0)
      into v_equipped_awakening
    from (select 1) _
    left join public.user_avatar_awakenings uaa
      on uaa.user_id = v_uid and uaa.avatar_item_id = v_equipped;
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
        'limited_time', si.id in ('avatar_quest_recruit', 'avatar_spark_apprentice'),
        'owned', (
          v_uid is not null
          and (
            si.id in ('avatar_default_female', 'avatar_default_male')
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
        ),
        'awakening_level', coalesce((
          select uaa.level
          from public.user_avatar_awakenings uaa
          where v_uid is not null
            and uaa.user_id = v_uid
            and uaa.avatar_item_id = si.id
        ), 0)
      )
      order by si.price asc, si.sort_order asc, si.id asc
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
        'limited_time', si.id = 'stage_sky_meadow',
        'owned', (
          v_uid is not null
          and (
            si.id = 'stage_blossom_courtyard'
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
      order by si.price asc, si.sort_order asc, si.id asc
    ),
    '[]'::jsonb
  )
  into v_stages
  from public.shop_items si
  where si.active and si.item_type = 'avatar_stage';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', si.id,
        'name', si.name,
        'description', si.description,
        'price', si.price,
        'rarity', si.rarity,
        'asset_key', si.asset_key,
        'parent_item_id', si.parent_item_id,
        'awakening_tier', si.awakening_tier,
        'owned', (
          v_uid is not null
          and exists (
            select 1
            from public.user_shop_entitlements ent
            where ent.user_id = v_uid and ent.item_id = si.id
          )
        )
      )
      order by si.parent_item_id, si.awakening_tier, si.id
    ),
    '[]'::jsonb
  )
  into v_awakenings
  from public.shop_items si
  where si.active and si.item_type = 'avatar_awakening';

  return jsonb_build_object(
    'ok', true,
    'authenticated', v_uid is not null,
    'balance', coalesce(v_balance, 0),
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_default_female'),
    'equipped_stage_id', coalesce(v_equipped_stage, 'stage_blossom_courtyard'),
    'equipped_awakening_level', coalesce(v_equipped_awakening, 0),
    'items', v_items,
    'stages', v_stages,
    'awakenings', v_awakenings
  );
end;
$$;

comment on function public.get_avatar_shop() is
  'Shop snapshot. Limited-time free items require an explicit purchase_shop_item claim.';

comment on function app_private.ensure_shop_account(uuid) is
  'Grants permanent free defaults only. Limited-time free claims are never auto-granted.';
