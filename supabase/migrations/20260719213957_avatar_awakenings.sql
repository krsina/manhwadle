-- Avatar Awakenings I & II: purchasable per-avatar upgrades (idle motion + thematic FX).
-- Additive: item_type, parent/tier columns, user_avatar_awakenings, shop/account RPC updates.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in ('avatar', 'theme', 'avatar_part', 'avatar_stage', 'avatar_awakening'));

alter table public.shop_items
  add column if not exists parent_item_id text;

alter table public.shop_items
  add column if not exists awakening_tier smallint;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_items_parent_item_id_fkey'
  ) then
    alter table public.shop_items
      add constraint shop_items_parent_item_id_fkey
      foreign key (parent_item_id) references public.shop_items(id) on delete restrict;
  end if;
end;
$fk$;

alter table public.shop_items
  drop constraint if exists shop_items_awakening_tier_check;

alter table public.shop_items
  add constraint shop_items_awakening_tier_check
  check (awakening_tier is null or awakening_tier in (1, 2));

alter table public.shop_items
  drop constraint if exists shop_items_awakening_shape_check;

alter table public.shop_items
  add constraint shop_items_awakening_shape_check
  check (
    (
      item_type = 'avatar_awakening'
      and parent_item_id is not null
      and awakening_tier is not null
      and slot is null
    )
    or (
      item_type <> 'avatar_awakening'
      and parent_item_id is null
      and awakening_tier is null
    )
  );

create unique index if not exists shop_items_awakening_parent_tier_uidx
  on public.shop_items (parent_item_id, awakening_tier)
  where item_type = 'avatar_awakening' and active;

create table if not exists public.user_avatar_awakenings (
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_item_id text not null references public.shop_items(id) on delete restrict,
  level smallint not null check (level in (1, 2)),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, avatar_item_id)
);

create index if not exists user_avatar_awakenings_avatar_idx
  on public.user_avatar_awakenings (avatar_item_id);

alter table public.user_avatar_awakenings enable row level security;

revoke all on table public.user_avatar_awakenings from public, anon, authenticated;
grant all on table public.user_avatar_awakenings to service_role;

-- ---------------------------------------------------------------------------
-- Seed awakenings for every premium (non-starter, price > 0) whole-character avatar
-- ---------------------------------------------------------------------------

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active,
   parent_item_id, awakening_tier)
select
  'awaken_' || si.id || '_1',
  'avatar_awakening',
  null,
  'Awakening I',
  'Bring ' || si.name || ' to life with a gentle idle and light thematic aura.',
  100,
  'rare',
  'awaken_' || si.id || '_1',
  9000 + si.sort_order,
  true,
  si.id,
  1
from public.shop_items si
where si.item_type = 'avatar'
  and si.active
  and si.price > 0
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
  parent_item_id = excluded.parent_item_id,
  awakening_tier = excluded.awakening_tier,
  updated_at = timezone('utc', now());

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active,
   parent_item_id, awakening_tier)
select
  'awaken_' || si.id || '_2',
  'avatar_awakening',
  null,
  'Awakening II',
  'Maximize ' || si.name || ' with a full cash-shop idle and dense thematic FX.',
  200,
  'epic',
  'awaken_' || si.id || '_2',
  9100 + si.sort_order,
  true,
  si.id,
  2
from public.shop_items si
where si.item_type = 'avatar'
  and si.active
  and si.price > 0
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
  parent_item_id = excluded.parent_item_id,
  awakening_tier = excluded.awakening_tier,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- get_avatar_shop: avatars (+ awakening_level) + stages + awakenings catalog
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
        ),
        'awakening_level', coalesce((
          select uaa.level
          from public.user_avatar_awakenings uaa
          where v_uid is not null
            and uaa.user_id = v_uid
            and uaa.avatar_item_id = si.id
        ), 0)
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

-- ---------------------------------------------------------------------------
-- purchase_shop_item: allow avatar_awakening with sequential gates
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
        and si.price = 0
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
  elsif v_item.price = 0 or exists (
    select 1 from public.user_shop_entitlements
    where user_id = v_uid and item_id = v_item.id
  ) then
    insert into public.user_shop_entitlements (user_id, item_id)
    values (v_uid, v_item.id)
    on conflict (user_id, item_id) do nothing;
    return jsonb_build_object('ok', false, 'error', 'already_owned');
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

-- ---------------------------------------------------------------------------
-- get_my_account: include equipped_awakening_level
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
  v_equipped_awakening smallint := 0;
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
  select coalesce(uaa.level, 0)
    into v_equipped_awakening
  from (select 1) _
  left join public.user_avatar_awakenings uaa
    on uaa.user_id = v_uid and uaa.avatar_item_id = coalesce(v_equipped, 'avatar_default_female');
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
    'equipped_stage_id', coalesce(v_equipped_stage, 'stage_blossom_courtyard'),
    'equipped_awakening_level', coalesce(v_equipped_awakening, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- export_shop_account: include awakenings
-- ---------------------------------------------------------------------------

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
    'avatar_awakenings', coalesce((
      select jsonb_agg(to_jsonb(uaa) order by uaa.updated_at)
      from public.user_avatar_awakenings uaa where uaa.user_id = p_user_id
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

revoke all on function public.get_avatar_shop() from public;
grant execute on function public.get_avatar_shop() to anon, authenticated, service_role;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated, service_role;

revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated, service_role;

revoke all on function public.export_shop_account(uuid) from public, anon, authenticated;
grant execute on function public.export_shop_account(uuid) to service_role;

comment on function public.get_avatar_shop() is
  'Returns Style A avatars (with awakening_level), stages, awakenings catalog, and equipped state.';
comment on function public.purchase_shop_item(text) is
  'Spends points for avatars, stages, themes, or sequential avatar awakenings.';
comment on function public.get_my_account() is
  'Returns profile, wallet, equipped avatar/stage, and equipped_awakening_level.';
comment on function public.export_shop_account(uuid) is
  'Service-role export of wallet, entitlements, awakenings, avatar profile, and ledger.';
comment on table public.user_avatar_awakenings is
  'Per-avatar awakening tier (1 or 2) owned by the user; upgrades idle FX for that character.';
