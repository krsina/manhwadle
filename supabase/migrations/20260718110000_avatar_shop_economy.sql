-- Server-authoritative avatar shop and points economy.
-- Gameplay rewards: win 10, exhausted loss 3, surrender 0.

alter table public.achievement_definitions
  add column if not exists point_reward integer not null default 0
  check (point_reward >= 0);

update public.achievement_definitions
set point_reward = case id
  when 'first_completion' then 25
  when 'completions_5' then 25
  when 'completions_10' then 50
  when 'completions_25' then 50
  when 'completions_50' then 100
  when 'completions_100' then 100
  when 'completions_250' then 200
  when 'completions_500' then 200
  when 'any_streak_3' then 25
  when 'any_streak_7' then 50
  when 'any_streak_14' then 50
  when 'any_streak_30' then 100
  when 'any_streak_60' then 200
  when 'any_streak_100' then 200
  when 'all_mode_day' then 25
  when 'all_mode_days_5' then 50
  when 'all_mode_streak_3' then 50
  when 'all_mode_streak_7' then 100
  when 'all_mode_days_25' then 100
  when 'all_mode_streak_14' then 100
  when 'all_mode_streak_30' then 200
  else point_reward
end;

create table if not exists public.shop_items (
  id text primary key,
  item_type text not null check (item_type in ('avatar', 'theme')),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  price integer not null check (price >= 0),
  rarity text not null check (rarity in ('starter', 'common', 'rare', 'epic', 'legendary')),
  asset_key text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_point_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_private.point_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  source_type text not null check (
    source_type in ('daily_completion', 'achievement', 'shop_purchase', 'refund', 'admin_adjustment')
  ),
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, source_type, source_id)
);

create index if not exists point_transactions_user_created_idx
  on app_private.point_transactions (user_id, created_at desc);

create table if not exists public.user_shop_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete restrict,
  acquired_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, item_id)
);

create index if not exists user_shop_entitlements_item_idx
  on public.user_shop_entitlements (item_id);

create table if not exists public.user_avatar_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_item_id text not null references public.shop_items(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.shop_items enable row level security;
alter table public.user_point_balances enable row level security;
alter table public.user_shop_entitlements enable row level security;
alter table public.user_avatar_profiles enable row level security;

revoke all on table public.shop_items from public, anon, authenticated;
revoke all on table public.user_point_balances from public, anon, authenticated;
revoke all on table public.user_shop_entitlements from public, anon, authenticated;
revoke all on table public.user_avatar_profiles from public, anon, authenticated;
revoke all on table app_private.point_transactions from public, anon, authenticated;

grant all on table public.shop_items to service_role;
grant all on table public.user_point_balances to service_role;
grant all on table public.user_shop_entitlements to service_role;
grant all on table public.user_avatar_profiles to service_role;
grant all on table app_private.point_transactions to service_role;

insert into public.shop_items
  (id, item_type, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_sora', 'avatar', 'Sora', 'A bright-eyed rooftop dreamer.', 0, 'starter', 'avatar_sora', 10, true),
  ('avatar_mina', 'avatar', 'Mina', 'A cheerful heroine with a cherry ribbon.', 60, 'common', 'avatar_mina', 20, true),
  ('avatar_ren', 'avatar', 'Ren', 'A cool swordsman in midnight blue.', 75, 'common', 'avatar_ren', 30, true),
  ('avatar_hana', 'avatar', 'Hana', 'A soft-spoken mage with violet curls.', 90, 'common', 'avatar_hana', 40, true),
  ('avatar_jun', 'avatar', 'Jun', 'A street fighter with a fearless grin.', 110, 'rare', 'avatar_jun', 50, true),
  ('avatar_yumi', 'avatar', 'Yumi', 'A shrine guardian carrying fox-fire.', 130, 'rare', 'avatar_yumi', 60, true),
  ('avatar_dae', 'avatar', 'Dae', 'A tiny dungeon tank with huge resolve.', 160, 'rare', 'avatar_dae', 70, true),
  ('avatar_nari', 'avatar', 'Nari', 'A neon idol from the future district.', 190, 'epic', 'avatar_nari', 80, true),
  ('avatar_kai', 'avatar', 'Kai', 'A storm caller with silver hair.', 230, 'epic', 'avatar_kai', 90, true),
  ('avatar_ari', 'avatar', 'Ari', 'A moonlit rogue with catlike reflexes.', 280, 'epic', 'avatar_ari', 100, true),
  ('avatar_tae', 'avatar', 'Tae', 'A crimson monarch in pocket-sized armor.', 340, 'legendary', 'avatar_tae', 110, true),
  ('avatar_sol', 'avatar', 'Sol', 'A golden celestial with a sunlit crown.', 420, 'legendary', 'avatar_sol', 120, true)
on conflict (id) do update set
  item_type = excluded.item_type,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  rarity = excluded.rarity,
  asset_key = excluded.asset_key,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = timezone('utc', now());

create or replace function app_private.ensure_shop_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_point_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.user_shop_entitlements (user_id, item_id)
  values (p_user_id, 'avatar_sora')
  on conflict (user_id, item_id) do nothing;

  insert into public.user_avatar_profiles (user_id, equipped_item_id)
  values (p_user_id, 'avatar_sora')
  on conflict (user_id) do nothing;
end;
$$;

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
    'daily_completion', 'achievement', 'shop_purchase', 'refund', 'admin_adjustment'
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

create or replace function app_private.award_daily_completion_points(
  p_user_id uuid,
  p_date_key text,
  p_mode text,
  p_outcome text,
  p_guess_count integer,
  p_max_guesses integer,
  p_surrendered boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_reward integer := 0;
begin
  v_reward := case
    when p_outcome = 'won' then 10
    when p_outcome = 'lost'
      and not coalesce(p_surrendered, false)
      and p_guess_count = p_max_guesses then 3
    else 0
  end;

  if v_reward = 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      )
    );
  end if;

  return app_private.apply_point_transaction(
    p_user_id,
    v_reward,
    'daily_completion',
    p_date_key || ':' || p_mode,
    jsonb_build_object('date_key', p_date_key, 'mode', p_mode, 'outcome', p_outcome)
  );
end;
$$;

create or replace function app_private.award_achievements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_summary public.user_streak_summary%rowtype;
  v_def public.achievement_definitions%rowtype;
  v_metric integer;
begin
  select * into v_summary from public.user_streak_summary where user_id = p_user_id;
  if not found then
    return;
  end if;

  for v_def in
    select * from public.achievement_definitions where active
  loop
    v_metric := case v_def.metric
      when 'total_completions' then v_summary.total_completions
      when 'any_max_streak' then v_summary.any_max_streak
      when 'any_current_streak' then v_summary.any_current_streak
      when 'all_max_streak' then v_summary.all_max_streak
      when 'all_complete_days' then v_summary.all_complete_days
      else 0
    end;

    if v_metric >= v_def.threshold then
      insert into public.user_achievements (
        user_id, achievement_id, achievement_version, awarded_at
      ) values (
        p_user_id, v_def.id, v_def.version, timezone('utc', now())
      )
      on conflict (user_id, achievement_id) do nothing;

      if found and v_def.point_reward > 0 then
        perform app_private.apply_point_transaction(
          p_user_id,
          v_def.point_reward,
          'achievement',
          v_def.id,
          jsonb_build_object('achievement_id', v_def.id, 'version', v_def.version)
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function app_private.on_daily_completion_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  perform app_private.refresh_user_day_activity(new.user_id, new.date_key);
  perform app_private.refresh_user_streak_summary(new.user_id);
  perform app_private.award_daily_completion_points(
    new.user_id,
    new.date_key,
    new.mode,
    new.outcome,
    new.guess_count,
    new.max_guesses,
    new.surrendered
  );
  perform app_private.award_achievements(new.user_id);
  return new;
end;
$$;

create or replace function public.complete_daily_mode_with_reward(
  p_mode text,
  p_taste text,
  p_guess_ids integer[],
  p_hints_used integer default 0,
  p_hard_mode boolean default false,
  p_surrendered boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_balance_before integer := 0;
  v_delta integer := 0;
  v_balance integer := 0;
begin
  perform app_private.ensure_shop_account(v_uid);
  select balance into v_balance_before
  from public.user_point_balances
  where user_id = v_uid;

  v_result := public.complete_daily_mode(
    p_mode,
    p_taste,
    p_guess_ids,
    p_hints_used,
    p_hard_mode,
    p_surrendered
  );

  select balance into v_balance
  from public.user_point_balances
  where user_id = v_uid;

  if coalesce((v_result ->> 'inserted')::boolean, false) then
    v_delta := greatest(coalesce(v_balance, 0) - coalesce(v_balance_before, 0), 0);
  end if;

  return v_result || jsonb_build_object(
    'point_delta', coalesce(v_delta, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

create or replace function public.get_avatar_shop()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
  v_equipped text;
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
        'equipped', si.id = v_equipped
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
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_sora'),
    'items', v_items
  );
end;
$$;

create or replace function public.purchase_avatar(p_item_id text)
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
  where id = p_item_id and item_type = 'avatar' and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_unavailable');
  end if;

  if exists (
    select 1 from public.user_shop_entitlements
    where user_id = v_uid and item_id = v_item.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  if v_item.price = 0 then
    select jsonb_build_object('applied', true, 'balance', balance)
    into v_points
    from public.user_point_balances
    where user_id = v_uid;
  else
    begin
      v_points := app_private.apply_point_transaction(
        v_uid,
        -v_item.price,
        'shop_purchase',
        v_item.id,
        jsonb_build_object('item_id', v_item.id, 'price', v_item.price)
      );
    exception
      when sqlstate 'P0001' then
        return jsonb_build_object('ok', false, 'error', 'insufficient_points');
    end;

    if not coalesce((v_points ->> 'applied')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
    end if;
  end if;

  insert into public.user_shop_entitlements (user_id, item_id)
  values (v_uid, v_item.id);

  return jsonb_build_object(
    'ok', true,
    'item_id', v_item.id,
    'balance', coalesce((v_points ->> 'balance')::integer, 0)
  );
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
  v_next timestamptz;
  v_role text;
  v_banned boolean;
  v_balance integer := 0;
  v_equipped text := 'avatar_sora';
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
    'equipped_avatar_id', coalesce(v_equipped, 'avatar_sora')
  );
end;
$$;

create or replace function public.get_my_achievements()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  return jsonb_build_object(
    'ok', true,
    'achievements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'version', ua.achievement_version,
            'title', d.title,
            'description', d.description,
            'category', d.category,
            'point_reward', d.point_reward,
            'awarded_at', ua.awarded_at
          )
          order by ua.awarded_at asc
        )
        from public.user_achievements ua
        join public.achievement_definitions d on d.id = ua.achievement_id
        where ua.user_id = v_uid
      ),
      '[]'::jsonb
    )
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

do $backfill$
declare
  v_completion record;
  v_achievement record;
begin
  for v_completion in
    select user_id, date_key, mode, outcome, guess_count, max_guesses, surrendered
    from public.daily_completions
    order by completed_at, user_id, date_key, mode
  loop
    perform app_private.award_daily_completion_points(
      v_completion.user_id,
      v_completion.date_key,
      v_completion.mode,
      v_completion.outcome,
      v_completion.guess_count,
      v_completion.max_guesses,
      v_completion.surrendered
    );
  end loop;

  for v_achievement in
    select ua.user_id, ua.achievement_id, ad.version, ad.point_reward
    from public.user_achievements ua
    join public.achievement_definitions ad on ad.id = ua.achievement_id
    where ad.point_reward > 0
    order by ua.awarded_at, ua.user_id, ua.achievement_id
  loop
    perform app_private.apply_point_transaction(
      v_achievement.user_id,
      v_achievement.point_reward,
      'achievement',
      v_achievement.achievement_id,
      jsonb_build_object(
        'achievement_id', v_achievement.achievement_id,
        'version', v_achievement.version,
        'backfilled', true
      )
    );
  end loop;
end;
$backfill$;

revoke all on function app_private.ensure_shop_account(uuid) from public, anon, authenticated;
revoke all on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;
revoke all on function app_private.award_achievements(uuid) from public, anon, authenticated;
revoke all on function app_private.on_daily_completion_insert() from public, anon, authenticated;

revoke all on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) from public, anon;
grant execute on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) to authenticated, service_role;

revoke all on function public.get_avatar_shop() from public;
grant execute on function public.get_avatar_shop() to anon, authenticated, service_role;

revoke all on function public.purchase_avatar(text) from public, anon;
grant execute on function public.purchase_avatar(text) to authenticated, service_role;

revoke all on function public.equip_avatar(text) from public, anon;
grant execute on function public.equip_avatar(text) to authenticated, service_role;

revoke all on function public.export_shop_account(uuid) from public, anon, authenticated;
grant execute on function public.export_shop_account(uuid) to service_role;

comment on function public.get_avatar_shop() is
  'Returns the active avatar catalog plus caller-owned and equipped state.';
comment on function public.purchase_avatar(text) is
  'Atomically spends server-awarded points and grants an avatar entitlement.';
comment on function public.equip_avatar(text) is
  'Equips an active avatar already owned by the authenticated caller.';
comment on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) is
  'Completes a verified daily mode and returns the server-awarded point delta and balance.';
