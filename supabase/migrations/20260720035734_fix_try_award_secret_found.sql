-- Harden try_award_secret: capture INSERT success before PERFORM overwrites FOUND.

create or replace function app_private.try_award_secret(
  p_user_id uuid,
  p_achievement_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_def public.achievement_definitions%rowtype;
  v_inserted boolean := false;
begin
  select * into v_def
  from public.achievement_definitions
  where id = p_achievement_id
    and active
    and category = 'secret';

  if not found then
    return false;
  end if;

  insert into public.user_achievements (
    user_id, achievement_id, achievement_version, awarded_at
  ) values (
    p_user_id, v_def.id, v_def.version, timezone('utc', now())
  )
  on conflict (user_id, achievement_id) do nothing;

  v_inserted := found;

  if v_inserted and v_def.point_reward > 0 then
    perform app_private.apply_point_transaction(
      p_user_id,
      v_def.point_reward,
      'achievement',
      v_def.id,
      jsonb_build_object('achievement_id', v_def.id, 'version', v_def.version)
    );
  end if;

  return v_inserted;
end;
$$;

revoke all on function app_private.try_award_secret(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.try_award_secret(uuid, text)
  to postgres, service_role;
