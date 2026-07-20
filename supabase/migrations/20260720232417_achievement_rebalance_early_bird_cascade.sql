-- Achievement rebalance:
-- - Drop Prologue (any_streak_1); keep Clean Sweep
-- - Deactivate visit-day / visit-streak ladders (no tab-open incentives)
-- - Hiatus returns → Hush-Hush (metric-backed secrets)
-- - Early Bird: signup within 4 months of leaderboard epoch
-- - Cascade requires 3+ new awards in one pass
-- - Restore award_all_modes_day_points on completion insert

-- ---------------------------------------------------------------------------
-- Catalog: deactivate removed ladders; hush-ify hiatus; seed Early Bird
-- ---------------------------------------------------------------------------

update public.achievement_definitions
set active = false
where id in (
  'any_streak_1',
  'visit_days_1',
  'visit_days_7',
  'visit_days_30',
  'visit_days_90',
  'visit_days_180',
  'visit_days_365',
  'visit_streak_3',
  'visit_streak_7',
  'visit_streak_14',
  'visit_streak_30',
  'visit_streak_60'
);

update public.achievement_definitions
set
  category = 'secret',
  description = case id
    when 'visit_comeback_1' then 'You woke up before the betrayal.'
    when 'visit_comeback_3' then 'Death is a soft reset.'
    when 'visit_comeback_5' then 'New body, same reading list.'
    when 'visit_comeback_10' then 'The plot cannot kill you.'
    when 'visit_timeskip' then 'Welcome to the next season.'
    else description
  end
where id in (
  'visit_comeback_1',
  'visit_comeback_3',
  'visit_comeback_5',
  'visit_comeback_10',
  'visit_timeskip'
);

insert into public.achievement_definitions (
  id, version, title, description, category, metric, threshold, active, point_reward
) values (
  'secret_early_bird',
  1,
  'Early Bird',
  'You showed up while the ink was still wet.',
  'secret',
  'secret_flag',
  1,
  true,
  100
)
on conflict (id) do update
set
  version = excluded.version,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  metric = excluded.metric,
  threshold = excluded.threshold,
  active = excluded.active,
  point_reward = excluded.point_reward;

-- ---------------------------------------------------------------------------
-- Early Bird: signup within [epoch, epoch + 4 months]
-- ---------------------------------------------------------------------------

create or replace function app_private.try_award_early_bird(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_epoch date;
  v_created date;
  v_end date;
begin
  if p_user_id is null then
    return false;
  end if;

  v_epoch := app_private.leaderboard_epoch_date()::date;
  v_end := (v_epoch + interval '4 months')::date;

  select (u.created_at at time zone 'utc')::date
    into v_created
  from auth.users u
  where u.id = p_user_id;

  if v_created is null then
    return false;
  end if;

  if v_created < v_epoch or v_created > v_end then
    return false;
  end if;

  return app_private.try_award_secret(p_user_id, 'secret_early_bird');
end;
$$;

revoke all on function app_private.try_award_early_bird(uuid)
  from public, anon, authenticated;
grant execute on function app_private.try_award_early_bird(uuid)
  to postgres, service_role;

comment on function app_private.try_award_early_bird(uuid) is
  'Grant Early Bird when auth.users.created_at falls in the first 4 months after leaderboard epoch.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  perform app_private.try_award_early_bird(new.id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Award path: metric-backed hush (hiatus) + Cascade at 3+
-- ---------------------------------------------------------------------------

create or replace function app_private.award_achievements(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_summary public.user_streak_summary%rowtype;
  v_def public.achievement_definitions%rowtype;
  v_metric integer;
  v_new_count integer := 0;
  v_inserted boolean := false;
begin
  perform app_private.try_award_early_bird(p_user_id);

  select * into v_summary from public.user_streak_summary where user_id = p_user_id;
  if not found then
    return 0;
  end if;

  -- Metric-backed awards only (includes hush hiatus returns; excludes secret_flag).
  for v_def in
    select *
    from public.achievement_definitions
    where active
      and metric <> 'secret_flag'
  loop
    v_metric := case v_def.metric
      when 'total_completions' then v_summary.total_completions
      when 'any_max_streak' then v_summary.any_max_streak
      when 'any_current_streak' then v_summary.any_current_streak
      when 'all_max_streak' then v_summary.all_max_streak
      when 'all_complete_days' then v_summary.all_complete_days
      when 'total_visit_days' then v_summary.total_visit_days
      when 'visit_max_streak' then v_summary.visit_max_streak
      when 'visit_comebacks' then v_summary.visit_comebacks
      when 'visit_long_comebacks' then v_summary.visit_long_comebacks
      else 0
    end;

    if v_metric >= v_def.threshold then
      insert into public.user_achievements (
        user_id, achievement_id, achievement_version, awarded_at
      ) values (
        p_user_id, v_def.id, v_def.version, timezone('utc', now())
      )
      on conflict (user_id, achievement_id) do nothing;

      v_inserted := found;

      if v_inserted then
        v_new_count := v_new_count + 1;
        if v_def.point_reward > 0 then
          perform app_private.apply_point_transaction(
            p_user_id,
            v_def.point_reward,
            'achievement',
            v_def.id,
            jsonb_build_object('achievement_id', v_def.id, 'version', v_def.version)
          );
        end if;
      end if;
    end if;
  end loop;

  if v_new_count >= 3 then
    perform app_private.try_award_secret(p_user_id, 'secret_cascade');
  end if;

  return v_new_count;
end;
$$;

revoke all on function app_private.award_achievements(uuid)
  from public, anon, authenticated;
grant execute on function app_private.award_achievements(uuid)
  to postgres, service_role;

-- Preserve restore_hush semantics: hard mode / no-hint are cosmetic for Cascade count.
create or replace function app_private.award_secrets_from_completion(
  p_user_id uuid,
  p_outcome text,
  p_guess_count integer,
  p_max_guesses integer,
  p_hints_used integer,
  p_hard_mode boolean,
  p_surrendered boolean,
  p_completed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_hour integer;
  v_new_count integer := 0;
begin
  if p_hard_mode then
    perform app_private.try_award_secret(p_user_id, 'secret_hard_mode');
  end if;

  if p_surrendered then
    if app_private.try_award_secret(p_user_id, 'secret_surrender') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if p_outcome = 'won' and not p_surrendered then
    if coalesce(p_hints_used, 0) = 0 then
      perform app_private.try_award_secret(p_user_id, 'secret_hint_denied');
    end if;
    if p_guess_count = 1 then
      if app_private.try_award_secret(p_user_id, 'secret_perfect') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
    if p_guess_count = p_max_guesses then
      if app_private.try_award_secret(p_user_id, 'secret_slow_burn') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
  end if;

  v_hour := extract(hour from timezone('utc', p_completed_at))::integer;
  if v_hour = 23 then
    if app_private.try_award_secret(p_user_id, 'secret_last_second') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if v_new_count >= 3 then
    perform app_private.try_award_secret(p_user_id, 'secret_cascade');
  end if;

  return v_new_count;
end;
$$;

revoke all on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) to postgres, service_role;

create or replace function app_private.on_daily_completion_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_ladder integer := 0;
  v_secrets integer := 0;
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
  v_ladder := app_private.award_achievements(new.user_id);
  v_secrets := app_private.award_secrets_from_completion(
    new.user_id,
    new.outcome,
    new.guess_count,
    new.max_guesses,
    new.hints_used,
    new.hard_mode,
    new.surrendered,
    new.completed_at
  );
  -- Cascade needs a real burst (3+), not forced twins like Full Party + Clean Sweep.
  if (v_ladder + v_secrets) >= 3 then
    perform app_private.try_award_secret(new.user_id, 'secret_cascade');
  end if;
  return new;
end;
$$;

revoke all on function app_private.on_daily_completion_insert()
  from public, anon, authenticated;
grant execute on function app_private.on_daily_completion_insert()
  to postgres, service_role;

-- Hydrate path: award Early Bird for existing early signups on account load.
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
  perform app_private.try_award_early_bird(v_uid);

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

revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated, service_role;
