-- Replace limited-time Quest Recruit / Spark Apprentice with Explorer A / Explorer B.
-- Additive catalog swap. Free claimables stay price 0 but NOT auto-owned.

-- ---------------------------------------------------------------------------
-- Unequip retired limited-time avatars
-- ---------------------------------------------------------------------------

update public.user_avatar_profiles
set equipped_item_id = 'avatar_default_female',
    updated_at = timezone('utc', now())
where equipped_item_id in ('avatar_quest_recruit', 'avatar_spark_apprentice');

delete from public.user_shop_entitlements
where item_id in ('avatar_quest_recruit', 'avatar_spark_apprentice');

-- ---------------------------------------------------------------------------
-- Retire old limited-time newbies; seed Explorer A / B
-- ---------------------------------------------------------------------------

update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where id in ('avatar_quest_recruit', 'avatar_spark_apprentice');

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_explorer_a', 'avatar', null, 'Explorer A',
   'First steps on the journey. Limited-time free claim.',
   0, 'common', 'avatar_explorer_a', 1, true),
  ('avatar_explorer_b', 'avatar', null, 'Explorer B',
   'First steps on the journey. Limited-time free claim.',
   0, 'common', 'avatar_explorer_b', 2, true)
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
set sort_order = 11,
    updated_at = timezone('utc', now())
where id = 'avatar_default_male';

-- ---------------------------------------------------------------------------
-- get_avatar_shop: mark Explorer A/B as limited_time
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
        'limited_time', si.id in ('avatar_explorer_a', 'avatar_explorer_b'),
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
