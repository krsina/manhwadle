-- Limited-time free claim avatars: Quest Recruit + Spark Apprentice.
-- Additive catalog seed. Free claimables are price 0 but NOT auto-owned
-- (unlike permanent starters). Shop lists avatars ordered by price ascending.

-- ---------------------------------------------------------------------------
-- Seed limited-time claim characters
-- ---------------------------------------------------------------------------

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_quest_recruit', 'avatar', null, 'Quest Recruit',
   'Limited-time free claim. Wooden practice sword and day-one adventurer energy.',
   0, 'common', 'avatar_quest_recruit', 1, true),
  ('avatar_spark_apprentice', 'avatar', null, 'Spark Apprentice',
   'Limited-time free claim. Mint twin tails and a wooden beginner staff.',
   0, 'common', 'avatar_spark_apprentice', 2, true)
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

-- Keep permanent starters after limited-time free claims in sort_order.
update public.shop_items
set sort_order = 10,
    updated_at = timezone('utc', now())
where id = 'avatar_default_female';

update public.shop_items
set sort_order = 20,
    updated_at = timezone('utc', now())
where id = 'avatar_default_male';

-- ---------------------------------------------------------------------------
-- ensure_shop_account: only auto-grant permanent starters (not all price = 0)
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

  -- Permanent free starters only (not limited-time claimables).
  insert into public.user_shop_entitlements (user_id, item_id)
  select p_user_id, si.id
  from public.shop_items si
  where si.item_type = 'avatar'
    and si.active
    and si.id in ('avatar_default_female', 'avatar_default_male')
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

-- ---------------------------------------------------------------------------
-- get_avatar_shop: price-asc sort; claimables owned only via entitlement
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
  'Avatar + stage + awakening shop snapshot. Avatars ordered by price; limited-time free claims require entitlement.';

-- ---------------------------------------------------------------------------
-- purchase_shop_item: free claim returns ok (no longer treats all price=0 as owned)
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
    -- Free claim / free unlock (limited-time avatars, free stages, etc.).
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

comment on function public.purchase_shop_item(text) is
  'Purchase or free-claim a shop item. Price 0 grants entitlement and returns ok.';
