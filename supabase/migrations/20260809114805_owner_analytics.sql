-- Owner-only signed-in gameplay analytics aggregates.
-- No guest/anonymous play collection.

create or replace function app_private.get_owner_analytics(
  p_actor_id uuid,
  p_start_date text,
  p_end_date text,
  p_mode text default null,
  p_taste text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_start date;
  v_end date;
  v_series jsonb;
  v_new_accounts bigint;
  v_signed_users bigint;
  v_all_modes_users bigint;
  v_player_days bigint;
  v_signed_starts bigint;
begin
  perform app_private.assert_moderation_actor(p_actor_id, true);
  if not app_private.consume_rpc_rate_limit(p_actor_id, 'owner_analytics', 20, 60) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  begin
    v_start := p_start_date::date;
    v_end := p_end_date::date;
  exception when others then
    raise exception 'invalid_date_range' using errcode = '22023';
  end;
  if v_end < v_start or v_end - v_start > 89 or v_end > timezone('utc', now())::date then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  if p_mode is not null and p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if p_taste is not null and p_taste not in ('action', 'romance', 'both') then
    raise exception 'invalid_taste' using errcode = '22023';
  end if;

  with eligible_attempts as (
    select da.*
    from app_private.daily_attempts da
    left join app_private.account_flags af on af.user_id = da.user_id
    where da.date_key between p_start_date and p_end_date
      and (p_mode is null or da.mode = p_mode)
      and (p_taste is null or da.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  eligible_completions as (
    select dc.*
    from public.daily_completions dc
    left join app_private.account_flags af on af.user_id = dc.user_id
    where dc.date_key between p_start_date and p_end_date
      and (p_mode is null or dc.mode = p_mode)
      and (p_taste is null or dc.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  signed_daily as (
    select
      ea.date_key,
      ea.mode,
      ea.taste,
      count(*)::bigint starts,
      count(ec.id)::bigint completions,
      count(ec.id) filter (where ec.outcome = 'won')::bigint wins,
      count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 1)::bigint first_tries,
      count(pt.id)::bigint double_solves,
      count(distinct ea.user_id)::bigint active_users,
      coalesce(sum(ec.guess_count), 0)::bigint guess_count_total,
      coalesce(sum(ec.hints_used), 0)::bigint hints_used_total,
      count(ec.id) filter (where ec.hard_mode)::bigint hard_mode_plays,
      array[
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 1),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 2),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 3),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 4),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 5),
        count(ec.id) filter (where ec.outcome = 'won' and ec.guess_count = 6)
      ]::bigint[] guess_distribution
    from eligible_attempts ea
    left join eligible_completions ec
      on ec.user_id = ea.user_id and ec.date_key = ea.date_key and ec.mode = ea.mode
    left join app_private.point_transactions pt
      on pt.user_id = ea.user_id
      and pt.source_type = 'bonus_name'
      and pt.source_id = ea.date_key || ':' || ea.mode
    group by ea.date_key, ea.mode, ea.taste
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(s) || jsonb_build_object('segment', 'signed')
      order by s.date_key, s.mode, s.taste
    ),
    '[]'::jsonb
  )
  into v_series
  from signed_daily s;

  select count(*) into v_new_accounts
  from auth.users u
  left join app_private.account_flags af on af.user_id = u.id
  where timezone('utc', u.created_at)::date between v_start and v_end
    and not coalesce(af.is_test, false)
    and not coalesce(af.is_suspicious, false);

  with eligible as (
    select da.user_id, da.date_key, da.mode
    from app_private.daily_attempts da
    left join app_private.account_flags af on af.user_id = da.user_id
    where da.date_key between p_start_date and p_end_date
      and (p_mode is null or da.mode = p_mode)
      and (p_taste is null or da.taste = p_taste)
      and not coalesce(af.is_test, false)
      and not coalesce(af.is_suspicious, false)
  ),
  per_day as (
    select user_id, date_key, count(distinct mode) modes
    from eligible group by user_id, date_key
  )
  select
    count(distinct p.user_id),
    coalesce(sum(p.modes), 0)::bigint,
    count(*) filter (where p.modes = 4)::bigint,
    count(*)::bigint
  into v_signed_users, v_signed_starts, v_all_modes_users, v_player_days
  from per_day p;

  perform app_private.audit_moderation(
    p_actor_id,
    null,
    'analytics_query',
    'Owner aggregate analytics query',
    jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'mode', p_mode,
      'taste', p_taste
    )
  );

  return jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'series', v_series,
    'new_accounts', coalesce(v_new_accounts, 0),
    'signed_active_users', coalesce(v_signed_users, 0),
    'signed_starts', coalesce(v_signed_starts, 0),
    'all_modes_player_days', coalesce(v_all_modes_users, 0),
    'signed_player_days', coalesce(v_player_days, 0),
    'generated_at', timezone('utc', now())
  );
end;
$$;

revoke all on function app_private.get_owner_analytics(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app_private.get_owner_analytics(uuid, text, text, text, text)
  to postgres, service_role;

create or replace function public.moderation_get_owner_analytics(
  p_actor_id uuid,
  p_start_date text,
  p_end_date text,
  p_mode text default null,
  p_taste text default null
)
returns jsonb
language sql
security invoker
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.get_owner_analytics(
    p_actor_id, p_start_date, p_end_date, p_mode, p_taste
  );
$$;

revoke all on function public.moderation_get_owner_analytics(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.moderation_get_owner_analytics(uuid, text, text, text, text)
  to service_role;
