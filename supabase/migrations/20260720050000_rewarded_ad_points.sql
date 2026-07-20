-- Once-daily rewarded ad points claim (no paid ad-free unlock).

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
      'all_modes_day',
      'rewarded_ad'
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
    'all_modes_day',
    'rewarded_ad'
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

create table if not exists public.user_rewarded_ad_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  points_awarded integer not null check (points_awarded > 0),
  claimed_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date_key),
  constraint user_rewarded_ad_claims_date_key_check
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$')
);

alter table public.user_rewarded_ad_claims enable row level security;

revoke all on table public.user_rewarded_ad_claims from public, anon, authenticated;
grant all on table public.user_rewarded_ad_claims to service_role;

create or replace function public.claim_rewarded_ad_points(
  p_date_key text,
  p_points integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_points integer := greatest(1, least(coalesce(p_points, 15), 50));
  v_today text := to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_date_key is null or p_date_key !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_date_key');
  end if;

  if p_date_key <> v_today then
    return jsonb_build_object('ok', false, 'error', 'date_mismatch');
  end if;

  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  insert into public.user_rewarded_ad_claims (user_id, date_key, points_awarded)
  values (v_uid, p_date_key, v_points)
  on conflict (user_id, date_key) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  v_result := app_private.apply_point_transaction(
    v_uid,
    v_points,
    'rewarded_ad',
    'rewarded_ad:' || p_date_key,
    jsonb_build_object('date_key', p_date_key)
  );

  return jsonb_build_object(
    'ok', true,
    'points_awarded', v_points,
    'date_key', p_date_key,
    'balance', coalesce((v_result ->> 'balance')::integer, 0),
    'lifetime_earned', (
      select lifetime_earned from public.user_point_balances where user_id = v_uid
    )
  );
end;
$$;

revoke all on function public.claim_rewarded_ad_points(text, integer) from public, anon;
grant execute on function public.claim_rewarded_ad_points(text, integer) to authenticated, service_role;

create or replace function public.get_rewarded_ad_claim_status(p_date_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_claimed boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select exists (
    select 1 from public.user_rewarded_ad_claims
    where user_id = v_uid and date_key = p_date_key
  ) into v_claimed;

  return jsonb_build_object(
    'ok', true,
    'date_key', p_date_key,
    'claimed', coalesce(v_claimed, false)
  );
end;
$$;

revoke all on function public.get_rewarded_ad_claim_status(text) from public, anon;
grant execute on function public.get_rewarded_ad_claim_status(text) to authenticated, service_role;

comment on function public.claim_rewarded_ad_points(text, integer) is
  'Awards points once per UTC date for a completed rewarded ad (signed-in).';
