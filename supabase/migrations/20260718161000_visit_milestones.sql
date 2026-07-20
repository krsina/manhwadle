-- Daily site-visit milestones (cultivation / regression / comeback ladder).
-- Visits are authenticated page loads, not mode completions.

-- ---------------------------------------------------------------------------
-- Visit day log + summary counters
-- ---------------------------------------------------------------------------

create table if not exists public.user_day_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  first_seen_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date_key),
  constraint user_day_visits_date_key_format
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$')
);

create index if not exists user_day_visits_user_date_idx
  on public.user_day_visits (user_id, date_key desc);

comment on table public.user_day_visits is
  'One row per authenticated UTC visit day. Server-recorded only; never client-attested.';

alter table public.user_day_visits enable row level security;
revoke all on table public.user_day_visits from public, anon, authenticated;
grant all on table public.user_day_visits to service_role;

alter table public.user_streak_summary
  add column if not exists visit_current_streak integer not null default 0
    check (visit_current_streak >= 0),
  add column if not exists visit_max_streak integer not null default 0
    check (visit_max_streak >= 0),
  add column if not exists total_visit_days integer not null default 0
    check (total_visit_days >= 0),
  add column if not exists visit_comebacks integer not null default 0
    check (visit_comebacks >= 0),
  add column if not exists visit_long_comebacks integer not null default 0
    check (visit_long_comebacks >= 0),
  add column if not exists last_visit_date_key text;

comment on column public.user_streak_summary.visit_comebacks is
  'Times the user returned after 7+ calendar days away.';
comment on column public.user_streak_summary.visit_long_comebacks is
  'Times the user returned after 30+ calendar days away.';

-- ---------------------------------------------------------------------------
-- Expand achievement category / metric checks
-- ---------------------------------------------------------------------------

alter table public.achievement_definitions
  drop constraint if exists achievement_definitions_category_check;

alter table public.achievement_definitions
  add constraint achievement_definitions_category_check
  check (category = any (array[
    'completions'::text,
    'streak'::text,
    'all_mode'::text,
    'visit'::text
  ]));

alter table public.achievement_definitions
  drop constraint if exists achievement_definitions_metric_check;

alter table public.achievement_definitions
  add constraint achievement_definitions_metric_check
  check (metric = any (array[
    'total_completions'::text,
    'any_max_streak'::text,
    'any_current_streak'::text,
    'all_max_streak'::text,
    'all_complete_days'::text,
    'total_visit_days'::text,
    'visit_max_streak'::text,
    'visit_comebacks'::text,
    'visit_long_comebacks'::text
  ]));

-- ---------------------------------------------------------------------------
-- Visit catalog (Hush-Hush names + manhwa return-arc flavor)
-- ---------------------------------------------------------------------------

insert into public.achievement_definitions
  (id, version, title, description, category, metric, threshold, active, point_reward)
values
  -- Visit-day dedication (cultivation ladder)
  ('visit_days_1', 1, 'Footstep',
   'Visit on 1 day. The sect gates open a crack.',
   'visit', 'total_visit_days', 1, true, 25),
  ('visit_days_7', 1, 'Outer Disciple',
   'Bank 7 visit days. Still sweeping the courtyard.',
   'visit', 'total_visit_days', 7, true, 25),
  ('visit_days_30', 1, 'Qi Condensation',
   'Bank 30 visit days. Your reading dantian stabilizes.',
   'visit', 'total_visit_days', 30, true, 50),
  ('visit_days_90', 1, 'Foundation',
   'Bank 90 visit days. No longer a mortal browser.',
   'visit', 'total_visit_days', 90, true, 100),
  ('visit_days_180', 1, 'Core Formation',
   'Bank 180 visit days. Half a year of quiet growth.',
   'visit', 'total_visit_days', 180, true, 100),
  ('visit_days_365', 1, 'Immortal Roster',
   'Bank 365 visit days. The ledger writes your name in gold.',
   'visit', 'total_visit_days', 365, true, 200),

  -- Visit streaks (daily cultivation)
  ('visit_streak_3', 1, 'Daily Sutra',
   'Reach a 3-day visit streak. Consistency over talent.',
   'visit', 'visit_max_streak', 3, true, 25),
  ('visit_streak_7', 1, 'Closed-Door',
   'Reach a 7-day visit streak. Do not disturb cultivation.',
   'visit', 'visit_max_streak', 7, true, 50),
  ('visit_streak_14', 1, 'Seclusion',
   'Reach a 14-day visit streak. The cave is starting to feel like home.',
   'visit', 'visit_max_streak', 14, true, 50),
  ('visit_streak_30', 1, 'Steady Heart',
   'Reach a 30-day visit streak. Bottlenecks fear your calendar.',
   'visit', 'visit_max_streak', 30, true, 100),
  ('visit_streak_60', 1, 'Heavenly Routine',
   'Reach a 60-day visit streak. Even tribulations wait their turn.',
   'visit', 'visit_max_streak', 60, true, 200),

  -- Comebacks (regression / reincarnation)
  ('visit_comeback_1', 1, 'Regression',
   'Return after 7+ days away. You woke up before the betrayal.',
   'visit', 'visit_comebacks', 1, true, 50),
  ('visit_comeback_3', 1, 'Second Life',
   'Come back from hiatus 3 times. Death is a soft reset.',
   'visit', 'visit_comebacks', 3, true, 50),
  ('visit_comeback_5', 1, 'Reincarnation',
   'Come back from hiatus 5 times. New body, same reading list.',
   'visit', 'visit_comebacks', 5, true, 100),
  ('visit_comeback_10', 1, 'Protagonist Arc',
   'Come back from hiatus 10 times. The plot cannot kill you.',
   'visit', 'visit_comebacks', 10, true, 200),
  ('visit_timeskip', 1, 'Time Skip',
   'Return after 30+ days away. Welcome to the next season.',
   'visit', 'visit_long_comebacks', 1, true, 100)
on conflict (id) do update set
  version = excluded.version,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  metric = excluded.metric,
  threshold = excluded.threshold,
  active = excluded.active,
  point_reward = excluded.point_reward;

-- ---------------------------------------------------------------------------
-- Refresh visit counters from the visit log
-- ---------------------------------------------------------------------------

create or replace function app_private.refresh_user_visit_summary(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_today text := public.current_utc_date_key();
  v_dates text[];
  v_streak record;
  v_total integer;
  v_last text;
begin
  select coalesce(array_agg(udv.date_key order by udv.date_key), '{}'::text[])
  into v_dates
  from public.user_day_visits udv
  where udv.user_id = p_user_id;

  select * into v_streak
  from app_private.compute_streak_from_dates(v_dates, v_today, '{}'::text[]);

  v_total := coalesce(cardinality(v_dates), 0);
  v_last := v_streak.last_date_key;

  insert into public.user_streak_summary (
    user_id,
    visit_current_streak,
    visit_max_streak,
    total_visit_days,
    last_visit_date_key,
    updated_at
  ) values (
    p_user_id,
    v_streak.current_streak,
    v_streak.max_streak,
    v_total,
    v_last,
    timezone('utc', now())
  )
  on conflict (user_id) do update set
    visit_current_streak = excluded.visit_current_streak,
    visit_max_streak = greatest(
      public.user_streak_summary.visit_max_streak,
      excluded.visit_max_streak
    ),
    total_visit_days = excluded.total_visit_days,
    last_visit_date_key = excluded.last_visit_date_key,
    updated_at = excluded.updated_at;
end;
$$;

comment on function app_private.refresh_user_visit_summary(uuid) is
  'Recompute visit streak + day counters from user_day_visits. Preserves comeback counters.';

revoke all on function app_private.refresh_user_visit_summary(uuid)
  from public, anon, authenticated;
grant execute on function app_private.refresh_user_visit_summary(uuid)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Award achievements: include visit metrics
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Public RPC: record today's visit (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.record_daily_visit()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := public.current_utc_date_key();
  v_last text;
  v_gap integer;
  v_inserted boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  -- Ensure summary row exists so awards can run for visit-only accounts.
  insert into public.user_streak_summary (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select uss.last_visit_date_key into v_last
  from public.user_streak_summary uss
  where uss.user_id = v_uid;

  insert into public.user_day_visits (user_id, date_key)
  values (v_uid, v_today)
  on conflict (user_id, date_key) do nothing;

  if found then
    v_inserted := true;

    if v_last is not null and v_last < v_today then
      v_gap := (v_today::date - v_last::date);
      if v_gap >= 7 then
        update public.user_streak_summary
        set visit_comebacks = visit_comebacks + 1,
            updated_at = timezone('utc', now())
        where user_id = v_uid;
      end if;
      if v_gap >= 30 then
        update public.user_streak_summary
        set visit_long_comebacks = visit_long_comebacks + 1,
            updated_at = timezone('utc', now())
        where user_id = v_uid;
      end if;
    end if;
  end if;

  perform app_private.refresh_user_visit_summary(v_uid);
  perform app_private.award_achievements(v_uid);

  return jsonb_build_object(
    'ok', true,
    'date_key', v_today,
    'recorded', v_inserted
  );
end;
$$;

comment on function public.record_daily_visit() is
  'Authenticated idempotent UTC visit ping. Updates visit counters and awards visit milestones.';

revoke all on function public.record_daily_visit() from public, anon;
grant execute on function public.record_daily_visit() to authenticated, service_role;
