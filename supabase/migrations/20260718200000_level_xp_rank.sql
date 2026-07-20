-- Character panel level/XP rank: dense rank by lifetime_earned among eligible players.

create or replace function public.get_my_level_rank()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_eligible boolean;
  v_xp integer := 0;
  v_rank integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  v_eligible := app_private.is_leaderboard_eligible(v_uid);

  select coalesce(upb.lifetime_earned, 0)
  into v_xp
  from public.user_point_balances upb
  where upb.user_id = v_uid;

  if v_eligible and v_xp > 0 then
    select x.dense_rank
    into v_rank
    from (
      select
        upb.user_id,
        dense_rank() over (order by upb.lifetime_earned desc) as dense_rank
      from public.user_point_balances upb
      where upb.lifetime_earned > 0
        and app_private.is_leaderboard_eligible(upb.user_id)
    ) x
    where x.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'eligible', v_eligible,
    'lifetime_earned', coalesce(v_xp, 0),
    'rank', v_rank
  );
end;
$$;

revoke all on function public.get_my_level_rank() from public, anon;
grant execute on function public.get_my_level_rank() to authenticated, service_role;

comment on function public.get_my_level_rank() is
  'Own dense rank by lifetime_earned (level XP) among leaderboard-eligible accounts with XP > 0.';
