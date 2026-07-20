-- Play XP leveling: win-only daily awards, first-try bonus, streak multiplier,
-- and a small double-solve follow-up (bonus_name) gated on a first-try win.

-- Widen ledger source_type for bonus-name awards.
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
      'bonus_name'
    )
  );

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
    'bonus_name'
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

-- Win-only play XP: base 10, first-try +2, streak mult up to 1.5x.
-- Losses / surrenders award 0. Signature kept for the insert trigger.
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
  v_result jsonb;
begin
  if p_outcome = 'won' then
    v_base := 10;
    if coalesce(p_guess_count, 0) = 1 then
      v_first_try := 2;
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

  v_result := app_private.apply_point_transaction(
    p_user_id,
    v_reward,
    'daily_completion',
    p_date_key || ':' || p_mode,
    jsonb_build_object(
      'date_key', p_date_key,
      'mode', p_mode,
      'outcome', p_outcome,
      'base', v_base,
      'first_try_bonus', v_first_try,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded', v_reward,
      'surrendered', coalesce(p_surrendered, false),
      'max_guesses', p_max_guesses
    )
  );

  return v_result || jsonb_build_object(
    'play_point_delta', coalesce((v_result ->> 'delta')::integer, 0)
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
  v_result jsonb;
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

  v_result := app_private.apply_point_transaction(
    p_user_id,
    v_reward,
    'bonus_name',
    p_date_key || ':' || p_mode,
    jsonb_build_object(
      'date_key', p_date_key,
      'mode', p_mode,
      'base', 3,
      'streak', v_streak,
      'streak_mult', v_mult,
      'awarded', v_reward
    )
  );

  return v_result || jsonb_build_object(
    'play_point_delta', coalesce((v_result ->> 'delta')::integer, 0)
  );
end;
$$;

-- Follow-up RPC: small XP when bonus character name is correct after a first-try win.
-- Name matching stays client-side; server gates on won + guess_count = 1.
create or replace function public.complete_bonus_name_with_reward(
  p_mode text,
  p_taste text,
  p_correct boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_completion public.daily_completions%rowtype;
  v_award jsonb;
  v_balance integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'Invalid mode'
      using errcode = '22023';
  end if;

  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    raise exception 'Invalid taste'
      using errcode = '22023';
  end if;

  perform app_private.ensure_shop_account(v_uid);

  select *
  into v_completion
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'no_completion',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if v_completion.outcome is distinct from 'won' or v_completion.guess_count <> 1 then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'not_first_try_win',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if not coalesce(p_correct, false) then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'incorrect',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  -- Taste on the completion must match the caller's reported taste lane.
  if v_completion.taste is distinct from p_taste then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'taste_mismatch',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  v_award := app_private.award_bonus_name_points(v_uid, v_date_key, p_mode);

  select balance into v_balance
  from public.user_point_balances
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'applied', coalesce((v_award ->> 'applied')::boolean, false),
    'date_key', v_date_key,
    'mode', p_mode,
    'taste', p_taste,
    'point_delta', coalesce((v_award ->> 'delta')::integer, 0),
    'play_point_delta', coalesce((v_award ->> 'play_point_delta')::integer, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

-- Enrich completion reward response with play_point_delta from the ledger row.
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
    select coalesce(pt.delta, 0)
    into v_play_delta
    from app_private.point_transactions pt
    where pt.user_id = v_uid
      and pt.source_type = 'daily_completion'
      and pt.source_id = v_date_key || ':' || coalesce(v_result ->> 'mode', p_mode);
    v_play_delta := coalesce(v_play_delta, 0);
  end if;

  return v_result || jsonb_build_object(
    'point_delta', coalesce(v_delta, 0),
    'play_point_delta', coalesce(v_play_delta, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function app_private.play_xp_streak_multiplier(integer)
  from public, anon, authenticated;
revoke all on function app_private.award_bonus_name_points(uuid, text, text)
  from public, anon, authenticated;
revoke all on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;

revoke all on function public.complete_bonus_name_with_reward(text, text, boolean)
  from public, anon;
grant execute on function public.complete_bonus_name_with_reward(text, text, boolean)
  to authenticated, service_role;

revoke all on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) from public, anon;
grant execute on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) to authenticated, service_role;

comment on function app_private.play_xp_streak_multiplier(integer) is
  'Streak XP multiplier: 1.0 at streak 1, +0.05 per extra day, capped at 1.5.';
comment on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) is
  'Win-only play XP: base 10, first-try +2, streak multiplier up to 1.5x.';
comment on function public.complete_bonus_name_with_reward(text, text, boolean) is
  'Awards a small double-solve XP bonus after a verified first-try win (client-reported bonus correct).';
comment on function public.complete_daily_mode_with_reward(
  text, text, integer[], integer, boolean, boolean
) is
  'Completes a verified daily mode and returns total point_delta, play_point_delta, and balance.';
