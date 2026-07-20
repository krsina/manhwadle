-- Rebalance play XP: base 100 / first-try +3 / golden +3 / all-modes +16,
-- ~2-year L99 curve, and a level-based daily play-XP anticheat cap.

-- ---------------------------------------------------------------------------
-- Ledger: allow all_modes_day
-- ---------------------------------------------------------------------------
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
      'all_modes_day'
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
    'all_modes_day'
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

-- ---------------------------------------------------------------------------
-- Level curve (mirrors src/lib/playerLevel.ts)
-- ---------------------------------------------------------------------------
create or replace function app_private.play_xp_days_to_advance(p_level integer)
returns integer
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
    when coalesce(p_level, 1) <= 2 then 1
    when p_level <= 4 then 2
    when p_level = 5 then 3
    else greatest(3, round(sqrt(p_level::numeric) * 1.15)::integer)
  end;
$$;

create or replace function app_private.play_xp_streak_multiplier(p_streak integer)
returns numeric
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select least(
    1.5::numeric,
    1::numeric + 0.05::numeric * greatest(0, coalesce(p_streak, 0) - 1)
  );
$$;

create or replace function app_private.play_xp_expected_after_days(p_days integer)
returns integer
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_xp integer := 0;
  v_streak integer := 0;
  v_mult numeric;
  v_d integer;
begin
  if coalesce(p_days, 0) <= 0 then
    return 0;
  end if;
  for v_d in 1 .. p_days loop
    v_streak := v_streak + 1;
    v_mult := app_private.play_xp_streak_multiplier(v_streak);
    v_xp := v_xp
      + floor(400::numeric * v_mult)::integer
      + floor(16::numeric * v_mult)::integer;
  end loop;
  return v_xp;
end;
$$;

create or replace function app_private.play_xp_threshold_for_level(p_level integer)
returns integer
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_days integer := 0;
  v_from integer;
  v_safe integer := greatest(1, coalesce(p_level, 1));
begin
  if v_safe <= 1 then
    return 0;
  end if;
  for v_from in 1 .. (v_safe - 1) loop
    v_days := v_days + app_private.play_xp_days_to_advance(v_from);
  end loop;
  return app_private.play_xp_expected_after_days(v_days);
end;
$$;

create or replace function app_private.play_xp_level_from_lifetime(p_lifetime integer)
returns integer
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_xp integer := greatest(0, coalesce(p_lifetime, 0));
  v_level integer := 1;
begin
  while v_level < 99 and app_private.play_xp_threshold_for_level(v_level + 1) <= v_xp loop
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

create or replace function app_private.play_xp_to_advance_from_level(p_level integer)
returns integer
language sql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
  select greatest(
    1,
    app_private.play_xp_threshold_for_level(greatest(1, coalesce(p_level, 1)) + 1)
      - app_private.play_xp_threshold_for_level(greatest(1, coalesce(p_level, 1)))
  );
$$;

-- Cap: clamp(ceil(span * 1.25), 478, 759)
create or replace function app_private.play_xp_daily_cap(p_level integer)
returns integer
language sql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
  select least(
    759,
    greatest(
      478,
      ceil(app_private.play_xp_to_advance_from_level(p_level)::numeric * 1.25)::integer
    )
  );
$$;

create or replace function app_private.play_xp_earned_on_date(
  p_user_id uuid,
  p_date_key text
)
returns integer
language sql
stable
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select coalesce(sum(pt.delta), 0)::integer
  from app_private.point_transactions pt
  where pt.user_id = p_user_id
    and pt.delta > 0
    and pt.source_type in ('daily_completion', 'bonus_name', 'all_modes_day')
    and (
      pt.metadata ->> 'date_key' = p_date_key
      or pt.source_id = p_date_key
      or pt.source_id like p_date_key || ':%'
    );
$$;

-- Apply a play award, clamping to the remaining daily cap for the player's level.
create or replace function app_private.apply_play_point_transaction(
  p_user_id uuid,
  p_delta integer,
  p_source_type text,
  p_source_id text,
  p_date_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_lifetime integer := 0;
  v_level integer := 1;
  v_cap integer := 478;
  v_earned integer := 0;
  v_remaining integer := 0;
  v_award integer := 0;
  v_result jsonb;
  v_meta jsonb;
begin
  if p_user_id is null or coalesce(p_delta, 0) <= 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0,
      'capped', false
    );
  end if;

  perform app_private.ensure_shop_account(p_user_id);
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('shop_points'));

  select coalesce(lifetime_earned, 0)
  into v_lifetime
  from public.user_point_balances
  where user_id = p_user_id;

  v_level := app_private.play_xp_level_from_lifetime(v_lifetime);
  v_cap := app_private.play_xp_daily_cap(v_level);
  v_earned := app_private.play_xp_earned_on_date(p_user_id, p_date_key);
  v_remaining := greatest(0, v_cap - v_earned);
  v_award := least(p_delta, v_remaining);

  v_meta := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'date_key', p_date_key,
    'requested', p_delta,
    'daily_play_xp_before', v_earned,
    'daily_cap', v_cap,
    'level_before', v_level,
    'capped', v_award < p_delta
  );

  if v_award <= 0 then
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0,
      'capped', true,
      'daily_cap', v_cap,
      'daily_play_xp', v_earned
    );
  end if;

  v_result := app_private.apply_point_transaction(
    p_user_id,
    v_award,
    p_source_type,
    p_source_id,
    v_meta
  );

  return v_result || jsonb_build_object(
    'play_point_delta', coalesce((v_result ->> 'delta')::integer, 0),
    'capped', v_award < p_delta,
    'daily_cap', v_cap,
    'daily_play_xp', v_earned + coalesce((v_result ->> 'delta')::integer, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Awards
-- ---------------------------------------------------------------------------
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
  v_base integer := 0;
  v_first_try integer := 0;
  v_streak integer := 0;
  v_mult numeric := 1;
  v_reward integer := 0;
begin
  if p_outcome = 'won' then
    v_base := 100;
    if coalesce(p_guess_count, 0) = 1 then
      v_first_try := 3;
    end if;
  end if;

  if v_base = 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  select coalesce(uss.any_current_streak, 0)
  into v_streak
  from public.user_streak_summary uss
  where uss.user_id = p_user_id;

  v_streak := coalesce(v_streak, 0);
  v_mult := app_private.play_xp_streak_multiplier(v_streak);
  v_reward := floor((v_base + v_first_try)::numeric * v_mult)::integer;

  if v_reward <= 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  return app_private.apply_play_point_transaction(
    p_user_id,
    v_reward,
    'daily_completion',
    p_date_key || ':' || p_mode,
    p_date_key,
    jsonb_build_object(
      'mode', p_mode,
      'outcome', p_outcome,
      'base', v_base,
      'first_try_bonus', v_first_try,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded_requested', v_reward,
      'surrendered', coalesce(p_surrendered, false),
      'max_guesses', p_max_guesses
    )
  );
end;
$$;

create or replace function app_private.award_bonus_name_points(
  p_user_id uuid,
  p_date_key text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_streak integer := 0;
  v_mult numeric := 1;
  v_reward integer := 0;
begin
  select coalesce(uss.any_current_streak, 0)
  into v_streak
  from public.user_streak_summary uss
  where uss.user_id = p_user_id;

  v_streak := coalesce(v_streak, 0);
  v_mult := app_private.play_xp_streak_multiplier(v_streak);
  v_reward := floor(3::numeric * v_mult)::integer;

  if v_reward <= 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  return app_private.apply_play_point_transaction(
    p_user_id,
    v_reward,
    'bonus_name',
    p_date_key || ':' || p_mode,
    p_date_key,
    jsonb_build_object(
      'mode', p_mode,
      'base', 3,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded_requested', v_reward
    )
  );
end;
$$;

create or replace function app_private.award_all_modes_day_points(
  p_user_id uuid,
  p_date_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_streak integer := 0;
  v_mult numeric := 1;
  v_reward integer := 0;
  v_all_complete boolean := false;
begin
  select coalesce(uda.all_complete, false)
  into v_all_complete
  from public.user_day_activity uda
  where uda.user_id = p_user_id
    and uda.date_key = p_date_key;

  if not coalesce(v_all_complete, false) then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0,
      'reason', 'not_all_complete'
    );
  end if;

  select coalesce(uss.any_current_streak, 0)
  into v_streak
  from public.user_streak_summary uss
  where uss.user_id = p_user_id;

  v_streak := coalesce(v_streak, 0);
  v_mult := app_private.play_xp_streak_multiplier(v_streak);
  v_reward := floor(16::numeric * v_mult)::integer;

  if v_reward <= 0 then
    perform app_private.ensure_shop_account(p_user_id);
    return jsonb_build_object(
      'applied', false,
      'delta', 0,
      'balance', (
        select balance from public.user_point_balances where user_id = p_user_id
      ),
      'play_point_delta', 0
    );
  end if;

  return app_private.apply_play_point_transaction(
    p_user_id,
    v_reward,
    'all_modes_day',
    p_date_key,
    p_date_key,
    jsonb_build_object(
      'base', 16,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded_requested', v_reward
    )
  );
end;
$$;

-- Preserve hush-hush secret awards; add all-modes day bonus after play XP.
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
  perform app_private.award_all_modes_day_points(new.user_id, new.date_key);
  perform app_private.award_achievements(new.user_id);
  perform app_private.award_secrets_from_completion(
    new.user_id,
    new.outcome,
    new.guess_count,
    new.max_guesses,
    new.hints_used,
    new.hard_mode,
    new.surrendered,
    new.completed_at
  );
  return new;
end;
$$;

-- Include all-modes bonus in play_point_delta when it fires on the same insert.
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
  v_play_delta integer := 0;
  v_date_key text;
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
    v_date_key := coalesce(v_result ->> 'date_key', public.current_utc_date_key());
    select coalesce(sum(pt.delta), 0)::integer
    into v_play_delta
    from app_private.point_transactions pt
    where pt.user_id = v_uid
      and pt.source_type in ('daily_completion', 'all_modes_day')
      and (
        (pt.source_type = 'daily_completion'
          and pt.source_id = v_date_key || ':' || coalesce(v_result ->> 'mode', p_mode))
        or (pt.source_type = 'all_modes_day' and pt.source_id = v_date_key)
      );
    v_play_delta := coalesce(v_play_delta, 0);
  end if;

  return v_result || jsonb_build_object(
    'point_delta', coalesce(v_delta, 0),
    'play_point_delta', coalesce(v_play_delta, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function app_private.play_xp_days_to_advance(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_expected_after_days(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_threshold_for_level(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_level_from_lifetime(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_to_advance_from_level(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_daily_cap(integer)
  from public, anon, authenticated;
revoke all on function app_private.play_xp_earned_on_date(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.apply_play_point_transaction(
  uuid, integer, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function app_private.award_all_modes_day_points(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;
revoke all on function app_private.award_bonus_name_points(uuid, text, text)
  from public, anon, authenticated;
revoke all on function app_private.on_daily_completion_insert()
  from public, anon, authenticated;

revoke all on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) from public, anon;
grant execute on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) to authenticated, service_role;

comment on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) is
  'Win-only play XP: base 100, first-try +3, streak mult up to 1.5x, daily cap.';
comment on function app_private.award_all_modes_day_points(uuid, text) is
  'Small +16 (x streak) when all required modes are complete for the UTC day.';
comment on function app_private.play_xp_daily_cap(integer) is
  'Anticheat daily play-XP cap: clamp(ceil(span*1.25), 478, 759).';
