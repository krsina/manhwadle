-- Community boards, streaks, achievements, site/mode status.
-- Forward migration after roles_moderation. Does not mutate remote until applied.
-- Completions are community-integrity only (answer IDs remain client-readable).

create schema if not exists app_private;

-- ---------------------------------------------------------------------------
-- Opaque public profile id (never auth.uid)
-- ---------------------------------------------------------------------------

alter table public.public_profiles
  add column if not exists public_id uuid not null default gen_random_uuid();

create unique index if not exists public_profiles_public_id_uidx
  on public.public_profiles (public_id);

comment on column public.public_profiles.public_id is
  'Opaque public identifier for community boards/cursors. Not auth.uid.';

-- ---------------------------------------------------------------------------
-- Account flags (test / suspicious) — staff-only via app_private RPCs
-- ---------------------------------------------------------------------------

create table if not exists app_private.account_flags (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_test boolean not null default false,
  is_suspicious boolean not null default false,
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

alter table app_private.account_flags enable row level security;
revoke all on table app_private.account_flags from public, anon, authenticated;
grant all on table app_private.account_flags to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Mode status + site banner (owner-controlled)
-- ---------------------------------------------------------------------------

create table if not exists public.mode_status (
  mode text primary key
    check (mode = any (array[
      'summary'::text,
      'character'::text,
      'cover'::text,
      'heardle'::text
    ])),
  available boolean not null default true,
  message text,
  required_for_all_mode boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.mode_status is
  'Per-mode availability and whether the mode is snapshotted into all-mode requirements.';

insert into public.mode_status (mode, available, required_for_all_mode)
values
  ('summary', true, true),
  ('character', true, true),
  ('cover', true, true),
  ('heardle', true, true)
on conflict (mode) do nothing;

create table if not exists public.site_status (
  id integer primary key check (id = 1),
  banner_message text,
  banner_severity text not null default 'info'
    check (banner_severity = any (array[
      'info'::text,
      'warning'::text,
      'critical'::text
    ])),
  maintenance_active boolean not null default false,
  -- Community boards count completions on/after this UTC date (production launch).
  leaderboard_epoch_date text not null default '2026-07-18'
    check (leaderboard_epoch_date ~ '^\d{4}-\d{2}-\d{2}$'),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_status (id)
values (1)
on conflict (id) do nothing;

comment on table public.site_status is
  'Owner-controlled maintenance banner and leaderboard epoch. Singleton id=1. '
  'Epoch becomes immutable after any production completion/activity exists.';

create table if not exists public.mode_outage_exemptions (
  date_key text not null
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  mode text not null
    check (mode = any (array[
      'summary'::text,
      'character'::text,
      'cover'::text,
      'heardle'::text
    ])),
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  primary key (date_key, mode)
);

comment on table public.mode_outage_exemptions is
  'Owner exemptions: mode skipped for all-mode completion on that UTC date. '
  'When every required mode is exempted, the day is neutral (empty effective set) '
  'and does not break all-mode streak adjacency.';

-- ---------------------------------------------------------------------------
-- Daily mode requirement snapshots (immutable once written)
-- ---------------------------------------------------------------------------

create table if not exists public.daily_mode_requirements (
  date_key text primary key
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  required_modes text[] not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint daily_mode_requirements_nonempty check (cardinality(required_modes) >= 1)
);

comment on table public.daily_mode_requirements is
  'Immutable snapshot of modes required for all-mode streaks on that UTC date. Never rewritten when modes are added later.';

create or replace function app_private.forbid_daily_mode_requirements_mutation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception 'daily_mode_requirements is immutable'
    using errcode = '23514';
end;
$$;

drop trigger if exists daily_mode_requirements_no_update on public.daily_mode_requirements;
create trigger daily_mode_requirements_no_update
  before update or delete on public.daily_mode_requirements
  for each row execute function app_private.forbid_daily_mode_requirements_mutation();

create or replace function app_private.snapshot_daily_mode_requirements()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_modes text[];
begin
  if exists (
    select 1 from public.daily_mode_requirements r where r.date_key = new.date_key
  ) then
    return new;
  end if;

  -- Never silently fall back to Summary / all-four when none are required.
  -- Neutral UTC days are modeled via outage exemptions that empty the effective set.
  select coalesce(array_agg(ms.mode order by ms.mode), '{}'::text[])
  into v_modes
  from public.mode_status ms
  where ms.required_for_all_mode;

  if v_modes is null or cardinality(v_modes) < 1 then
    raise exception
      'invalid_mode_requirements: at least one mode must have required_for_all_mode; use outage exemptions for neutral days'
      using errcode = '22023';
  end if;

  insert into public.daily_mode_requirements (date_key, required_modes)
  values (new.date_key, v_modes)
  on conflict (date_key) do nothing;

  return new;
end;
$$;

drop trigger if exists daily_puzzles_snapshot_requirements on public.daily_puzzles;
create trigger daily_puzzles_snapshot_requirements
  after insert on public.daily_puzzles
  for each row execute function app_private.snapshot_daily_mode_requirements();

-- ---------------------------------------------------------------------------
-- User day activity + streak summary (derived from daily_completions)
-- ---------------------------------------------------------------------------

create table if not exists public.user_day_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  completed_modes text[] not null default '{}'::text[],
  any_complete boolean not null default false,
  all_complete boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date_key)
);

create index if not exists user_day_activity_any_idx
  on public.user_day_activity (date_key)
  where any_complete;

create index if not exists user_day_activity_all_idx
  on public.user_day_activity (date_key)
  where all_complete;

comment on table public.user_day_activity is
  'Per-user UTC day completion set derived from immutable daily_completions.';

create table if not exists public.user_streak_summary (
  user_id uuid primary key references auth.users (id) on delete cascade,
  any_current_streak integer not null default 0 check (any_current_streak >= 0),
  any_max_streak integer not null default 0 check (any_max_streak >= 0),
  all_current_streak integer not null default 0 check (all_current_streak >= 0),
  all_max_streak integer not null default 0 check (all_max_streak >= 0),
  total_completions integer not null default 0 check (total_completions >= 0),
  all_complete_days integer not null default 0 check (all_complete_days >= 0),
  last_any_date_key text,
  last_all_date_key text,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.user_streak_summary is
  'Account-wide streak + completion counters for community boards. Epoch-filtered.';

-- ---------------------------------------------------------------------------
-- Achievements (server-derived only)
-- ---------------------------------------------------------------------------

create table if not exists public.achievement_definitions (
  id text primary key,
  version integer not null default 1 check (version >= 1),
  title text not null,
  description text not null,
  category text not null
    check (category = any (array[
      'completions'::text,
      'streak'::text,
      'all_mode'::text
    ])),
  metric text not null
    check (metric = any (array[
      'total_completions'::text,
      'any_max_streak'::text,
      'any_current_streak'::text,
      'all_max_streak'::text,
      'all_complete_days'::text
    ])),
  threshold integer not null check (threshold >= 1),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.achievement_definitions
  (id, version, title, description, category, metric, threshold)
values
  ('first_completion', 1, 'First finish',
   'Record your first verified daily completion.', 'completions', 'total_completions', 1),
  ('completions_10', 1, 'Getting started',
   'Finish 10 verified daily modes.', 'completions', 'total_completions', 10),
  ('completions_50', 1, 'Dedicated reader',
   'Finish 50 verified daily modes.', 'completions', 'total_completions', 50),
  ('any_streak_3', 1, 'Three-day rhythm',
   'Reach a 3-day any-mode streak.', 'streak', 'any_max_streak', 3),
  ('any_streak_7', 1, 'Week of play',
   'Reach a 7-day any-mode streak.', 'streak', 'any_max_streak', 7),
  ('all_mode_day', 1, 'Full clear',
   'Finish every required mode on a single day.', 'all_mode', 'all_complete_days', 1),
  ('all_mode_streak_3', 1, 'Triple full clear',
   'Reach a 3-day all-mode streak.', 'all_mode', 'all_max_streak', 3)
on conflict (id) do nothing;

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievement_definitions (id),
  achievement_version integer not null,
  awarded_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id, awarded_at desc);

comment on table public.user_achievements is
  'Server-awarded achievements only. Never trust client attestation (hard_mode/hints excluded).';

-- ---------------------------------------------------------------------------
-- RLS: no direct public reads of private activity/streaks/flags
-- ---------------------------------------------------------------------------

alter table public.mode_status enable row level security;
alter table public.site_status enable row level security;
alter table public.mode_outage_exemptions enable row level security;
alter table public.daily_mode_requirements enable row level security;
alter table public.user_day_activity enable row level security;
alter table public.user_streak_summary enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;

revoke all on table public.mode_status from public, anon, authenticated;
revoke all on table public.site_status from public, anon, authenticated;
revoke all on table public.mode_outage_exemptions from public, anon, authenticated;
revoke all on table public.daily_mode_requirements from public, anon, authenticated;
revoke all on table public.user_day_activity from public, anon, authenticated;
revoke all on table public.user_streak_summary from public, anon, authenticated;
revoke all on table public.achievement_definitions from public, anon, authenticated;
revoke all on table public.user_achievements from public, anon, authenticated;

grant select on table public.achievement_definitions to anon, authenticated;
grant all on table public.mode_status to service_role;
grant all on table public.site_status to service_role;
grant all on table public.mode_outage_exemptions to service_role;
grant all on table public.daily_mode_requirements to service_role;
grant all on table public.user_day_activity to service_role;
grant all on table public.user_streak_summary to service_role;
grant all on table public.achievement_definitions to service_role;
grant all on table public.user_achievements to service_role;

drop policy if exists achievement_definitions_select_all on public.achievement_definitions;
create policy achievement_definitions_select_all
  on public.achievement_definitions
  for select
  to anon, authenticated
  using (active = true);

-- No client policies on activity/streak/achievement award/status tables —
-- reads go through narrow SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.is_valid_utc_date_key(p_date_key text)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
begin
  if p_date_key is null or p_date_key !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return to_char(p_date_key::date, 'YYYY-MM-DD') = p_date_key;
exception
  when others then
    return false;
end;
$$;

comment on function app_private.is_valid_utc_date_key(text) is
  'True when text is a real UTC calendar date that round-trips through date::text as YYYY-MM-DD.';

create or replace function app_private.leaderboard_epoch_date()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(
    (select s.leaderboard_epoch_date from public.site_status s where s.id = 1),
    '2026-07-18'
  );
$$;

create or replace function app_private.shift_utc_date_key(p_date_key text, p_delta integer)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v_date date;
begin
  v_date := p_date_key::date + p_delta;
  return to_char(v_date, 'YYYY-MM-DD');
end;
$$;

create or replace function app_private.effective_required_modes(p_date_key text)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  -- Empty result = neutral UTC day (fully exempt). Callers must not treat empty as
  -- "all complete"; streak adjacency skips these dates instead.
  select coalesce(
    (
      select array_agg(m order by m)
      from unnest(
        coalesce(
          (select r.required_modes from public.daily_mode_requirements r where r.date_key = p_date_key),
          -- Snapshot missing: use live required flags (no silent Summary-only fallback).
          (
            select coalesce(array_agg(ms.mode order by ms.mode), '{}'::text[])
            from public.mode_status ms
            where ms.required_for_all_mode
          )
        )
      ) as m
      where m not in (
        select e.mode from public.mode_outage_exemptions e where e.date_key = p_date_key
      )
    ),
    '{}'::text[]
  );
$$;

comment on function app_private.effective_required_modes(text) is
  'Modes still required for all-mode on a UTC date after exemptions. Empty = neutral day.';

create or replace function app_private.is_neutral_all_mode_date(p_date_key text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select cardinality(app_private.effective_required_modes(p_date_key)) = 0;
$$;

create or replace function app_private.collect_neutral_all_mode_dates(
  p_from text,
  p_to text
)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select coalesce(
    (
      select array_agg(d.date_key order by d.date_key)
      from (
        select distinct x.date_key
        from (
          select r.date_key from public.daily_mode_requirements r
          where r.date_key >= p_from and r.date_key <= p_to
          union
          select e.date_key from public.mode_outage_exemptions e
          where e.date_key >= p_from and e.date_key <= p_to
        ) x
        where app_private.is_neutral_all_mode_date(x.date_key)
      ) d
    ),
    '{}'::text[]
  );
$$;

create or replace function app_private.only_neutral_between(
  p_earlier text,
  p_later text,
  p_neutral_dates text[]
)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_cursor text;
  v_neutral text[] := coalesce(p_neutral_dates, '{}'::text[]);
begin
  if p_earlier is null or p_later is null or p_later <= p_earlier then
    return false;
  end if;
  v_cursor := app_private.shift_utc_date_key(p_earlier, 1);
  while v_cursor < p_later loop
    if not (v_cursor = any (v_neutral)) then
      return false;
    end if;
    v_cursor := app_private.shift_utc_date_key(v_cursor, 1);
  end loop;
  return true;
end;
$$;

create or replace function app_private.is_streak_currently_active(
  p_last_date_key text,
  p_today text,
  p_neutral_dates text[] default '{}'::text[]
)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_yesterday text;
begin
  -- Public ranking decay: current streak is live-zero unless last qualifying date is
  -- still in the grace window. Yesterday grace is preserved. Fully exempt (neutral)
  -- dates extend the window so multi-day outages do not falsely zero all-mode currents.
  if p_last_date_key is null then
    return false;
  end if;
  if p_last_date_key = p_today then
    return true;
  end if;
  v_yesterday := app_private.shift_utc_date_key(p_today, -1);
  if p_last_date_key = v_yesterday then
    return true;
  end if;
  if p_last_date_key < p_today
     and app_private.only_neutral_between(p_last_date_key, p_today, p_neutral_dates) then
    return true;
  end if;
  return false;
end;
$$;

comment on function app_private.is_streak_currently_active(text, text, text[]) is
  'True when a stored current streak may still be shown: last date is today/yesterday, or only neutral dates lie between last and today.';

create or replace function app_private.live_current_streak(
  p_stored integer,
  p_last_date_key text,
  p_today text,
  p_neutral_dates text[] default '{}'::text[]
)
returns integer
language sql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
  select case
    when app_private.is_streak_currently_active(p_last_date_key, p_today, p_neutral_dates)
      then greatest(coalesce(p_stored, 0), 0)
    else 0
  end;
$$;

create or replace function app_private.is_leaderboard_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select
    coalesce(
      (select us.leaderboard_visible from public.user_settings us where us.user_id = p_user_id),
      false
    )
    and app_private.can_appear_publicly(p_user_id)
    and not app_private.has_active_restriction(p_user_id, 'leaderboard_exclusion')
    and not coalesce(
      (select f.is_test from app_private.account_flags f where f.user_id = p_user_id),
      false
    )
    and not coalesce(
      (select f.is_suspicious from app_private.account_flags f where f.user_id = p_user_id),
      false
    );
$$;

create or replace function app_private.compute_streak_from_dates(
  p_dates text[],
  p_today text,
  p_neutral_dates text[] default '{}'::text[]
)
returns table (current_streak integer, max_streak integer, last_date_key text)
language plpgsql
immutable
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_set text[] := coalesce(p_dates, '{}'::text[]);
  v_neutral text[] := coalesce(p_neutral_dates, '{}'::text[]);
  v_cursor text;
  v_current integer := 0;
  v_max integer := 0;
  v_run integer := 0;
  v_prev text := null;
  v_key text;
  v_last text := null;
begin
  -- Neutral dates are skipped for adjacency (do not break runs) and are never counted.
  if cardinality(v_set) = 0 then
    current_streak := 0;
    max_streak := 0;
    last_date_key := null;
    return next;
    return;
  end if;

  select max(d) into v_last from unnest(v_set) as d;

  -- Grace: if today is not a qualifying day and is not neutral, start from yesterday.
  if p_today = any (v_set) or p_today = any (v_neutral) then
    v_cursor := p_today;
  else
    v_cursor := app_private.shift_utc_date_key(p_today, -1);
  end if;

  loop
    if v_cursor = any (v_neutral) then
      v_cursor := app_private.shift_utc_date_key(v_cursor, -1);
      continue;
    end if;
    if v_cursor = any (v_set) then
      v_current := v_current + 1;
      v_cursor := app_private.shift_utc_date_key(v_cursor, -1);
      continue;
    end if;
    exit;
  end loop;

  for v_key in select d from unnest(v_set) as d order by d loop
    if v_prev is null then
      v_run := 1;
    elsif v_key = app_private.shift_utc_date_key(v_prev, 1)
       or app_private.only_neutral_between(v_prev, v_key, v_neutral) then
      v_run := v_run + 1;
    else
      v_run := 1;
    end if;
    if v_run > v_max then
      v_max := v_run;
    end if;
    v_prev := v_key;
  end loop;

  current_streak := v_current;
  max_streak := v_max;
  last_date_key := v_last;
  return next;
end;
$$;

comment on function app_private.compute_streak_from_dates(text[], text, text[]) is
  'UTC streak stats with yesterday grace. Neutral dates are skipped for adjacency and never counted.';

create or replace function app_private.refresh_user_day_activity(
  p_user_id uuid,
  p_date_key text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_modes text[];
  v_required text[];
  v_any boolean;
  v_all boolean;
  v_epoch text := app_private.leaderboard_epoch_date();
begin
  -- Serialize same-user/date derived refresh so concurrent mode completions cannot
  -- overwrite completed_modes with a partial committed snapshot.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_date_key));

  if p_date_key < v_epoch then
    delete from public.user_day_activity
    where user_id = p_user_id and date_key = p_date_key;
    return;
  end if;

  -- Reread after lock: includes rows committed by waiters and this transaction.
  select coalesce(array_agg(dc.mode order by dc.mode), '{}'::text[])
  into v_modes
  from public.daily_completions dc
  where dc.user_id = p_user_id
    and dc.date_key = p_date_key;

  v_required := app_private.effective_required_modes(p_date_key);
  v_any := cardinality(v_modes) > 0;
  -- Neutral day (empty required): not all_complete; adjacency skip handles streaks.
  v_all := cardinality(v_required) > 0
    and v_required <@ v_modes;

  insert into public.user_day_activity (
    user_id, date_key, completed_modes, any_complete, all_complete, updated_at
  ) values (
    p_user_id, p_date_key, v_modes, v_any, v_all, timezone('utc', now())
  )
  on conflict (user_id, date_key) do update set
    completed_modes = excluded.completed_modes,
    any_complete = excluded.any_complete,
    all_complete = excluded.all_complete,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function app_private.refresh_user_streak_summary(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_epoch text := app_private.leaderboard_epoch_date();
  v_today text := public.current_utc_date_key();
  v_any_dates text[];
  v_all_dates text[];
  v_neutral text[];
  v_any record;
  v_all record;
  v_total integer;
  v_all_days integer;
  v_span_from text;
  v_span_to text;
begin
  select coalesce(array_agg(uda.date_key order by uda.date_key), '{}'::text[])
  into v_any_dates
  from public.user_day_activity uda
  where uda.user_id = p_user_id
    and uda.any_complete
    and uda.date_key >= v_epoch;

  select coalesce(array_agg(uda.date_key order by uda.date_key), '{}'::text[])
  into v_all_dates
  from public.user_day_activity uda
  where uda.user_id = p_user_id
    and uda.all_complete
    and uda.date_key >= v_epoch;

  v_span_from := v_epoch;
  v_span_to := v_today;
  v_neutral := app_private.collect_neutral_all_mode_dates(v_span_from, v_span_to);

  select * into v_any from app_private.compute_streak_from_dates(v_any_dates, v_today, '{}'::text[]);
  select * into v_all from app_private.compute_streak_from_dates(v_all_dates, v_today, v_neutral);

  select count(*)::integer into v_total
  from public.daily_completions dc
  where dc.user_id = p_user_id
    and dc.date_key >= v_epoch;

  v_all_days := coalesce(cardinality(v_all_dates), 0);

  insert into public.user_streak_summary (
    user_id,
    any_current_streak,
    any_max_streak,
    all_current_streak,
    all_max_streak,
    total_completions,
    all_complete_days,
    last_any_date_key,
    last_all_date_key,
    updated_at
  ) values (
    p_user_id,
    v_any.current_streak,
    v_any.max_streak,
    v_all.current_streak,
    v_all.max_streak,
    v_total,
    v_all_days,
    v_any.last_date_key,
    v_all.last_date_key,
    timezone('utc', now())
  )
  on conflict (user_id) do update set
    any_current_streak = excluded.any_current_streak,
    any_max_streak = excluded.any_max_streak,
    all_current_streak = excluded.all_current_streak,
    all_max_streak = excluded.all_max_streak,
    total_completions = excluded.total_completions,
    all_complete_days = excluded.all_complete_days,
    last_any_date_key = excluded.last_any_date_key,
    last_all_date_key = excluded.last_all_date_key,
    updated_at = excluded.updated_at;
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
  -- Idempotent: refresh derives from daily_completions; unique (user,date,mode) prevents dupes.
  perform app_private.refresh_user_day_activity(new.user_id, new.date_key);
  perform app_private.refresh_user_streak_summary(new.user_id);
  perform app_private.award_achievements(new.user_id);
  return new;
end;
$$;

drop trigger if exists daily_completions_refresh_streaks on public.daily_completions;
create trigger daily_completions_refresh_streaks
  after insert on public.daily_completions
  for each row execute function app_private.on_daily_completion_insert();

create or replace function app_private.recompute_all_complete_for_date(p_date_key text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid;
begin
  for v_uid in
    select distinct uda.user_id
    from public.user_day_activity uda
    where uda.date_key = p_date_key
  loop
    perform app_private.refresh_user_day_activity(v_uid, p_date_key);
    perform app_private.refresh_user_streak_summary(v_uid);
    perform app_private.award_achievements(v_uid);
  end loop;
end;
$$;

-- Service reconciliation: recompute summaries whose cached current streaks would decay.
-- Schedule via pg_cron / external cron shortly after UTC midnight. Public RPCs also
-- apply live decay so boards stay correct even if this job is delayed.
create or replace function app_private.reconcile_stale_current_streaks(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_today text := public.current_utc_date_key();
  v_neutral text[];
  v_uid uuid;
  v_count integer := 0;
  v_live_any integer;
  v_live_all integer;
begin
  v_neutral := app_private.collect_neutral_all_mode_dates(
    app_private.leaderboard_epoch_date(),
    v_today
  );

  for v_uid in
    select uss.user_id
    from public.user_streak_summary uss
    where uss.any_current_streak > 0
       or uss.all_current_streak > 0
    order by uss.updated_at asc
    limit least(greatest(coalesce(p_limit, 500), 1), 5000)
  loop
    select
      app_private.live_current_streak(
        s.any_current_streak, s.last_any_date_key, v_today, '{}'::text[]
      ),
      app_private.live_current_streak(
        s.all_current_streak, s.last_all_date_key, v_today, v_neutral
      )
    into v_live_any, v_live_all
    from public.user_streak_summary s
    where s.user_id = v_uid;

    if exists (
      select 1
      from public.user_streak_summary s
      where s.user_id = v_uid
        and s.any_current_streak = v_live_any
        and s.all_current_streak = v_live_all
    ) then
      continue;
    end if;

    perform app_private.refresh_user_streak_summary(v_uid);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function app_private.reconcile_stale_current_streaks(integer) is
  'Service-only: refresh streak summaries that would show stale current values after UTC day roll. Pair with live decay in public RPCs.';

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'reconcile_stale_current_streaks';

    perform cron.schedule(
      'reconcile_stale_current_streaks',
      '5 0 * * *',
      $job$select app_private.reconcile_stale_current_streaks(2000);$job$
    );
  end if;
exception
  when others then
    -- Cron is optional; live RPC decay remains the correctness guarantee.
    null;
end;
$cron$;

-- ---------------------------------------------------------------------------
-- Public / authenticated RPCs (narrow, no private table grants)
-- ---------------------------------------------------------------------------

create or replace function public.get_public_site_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_site public.site_status%rowtype;
begin
  select * into v_site from public.site_status where id = 1;
  return jsonb_build_object(
    'ok', true,
    'banner_message', v_site.banner_message,
    'banner_severity', v_site.banner_severity,
    'maintenance_active', coalesce(v_site.maintenance_active, false),
    'leaderboard_epoch_date', v_site.leaderboard_epoch_date,
    'modes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'mode', ms.mode,
            'available', ms.available,
            'message', ms.message
          )
          order by ms.mode
        )
        from public.mode_status ms
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_leaderboard(
  p_board text,
  p_limit integer default 25,
  p_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_board text := p_board;
  v_cursor_json jsonb;
  v_cursor_value integer;
  v_cursor_u text;
  v_cursor_p text;
  v_rows jsonb := '[]'::jsonb;
  v_next text := null;
  v_has_more boolean := false;
  v_last_value integer;
  v_last_u text;
  v_last_p text;
  v_today text := public.current_utc_date_key();
begin
  -- all_mode_streak board ranks all_max_streak (longest all-mode run), not current.
  if v_board not in ('all_mode_streak', 'longest_streak', 'current_streak') then
    raise exception 'Invalid board'
      using errcode = '22023';
  end if;

  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      if (v_cursor_json->>'v')::integer <> 1
         or v_cursor_json->>'board' is distinct from v_board then
        raise exception 'Invalid cursor'
          using errcode = '22023';
      end if;
      v_cursor_value := (v_cursor_json->>'value')::integer;
      v_cursor_u := nullif(trim(v_cursor_json->>'u'), '');
      v_cursor_p := nullif(trim(v_cursor_json->>'p'), '');
      if v_cursor_value is null
         or v_cursor_u is null
         or v_cursor_p is null
         or v_cursor_p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid cursor'
          using errcode = '22023';
      end if;
    exception
      when others then
        raise exception 'Invalid cursor'
          using errcode = '22023';
    end;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', q.rank,
          'username', q.username,
          'value', q.value,
          'public_id', q.public_id
        )
        order by q.value desc, q.username_normalized asc, q.public_id asc
      ) filter (where q.page_pos <= v_limit),
      '[]'::jsonb
    ),
    bool_or(q.page_pos = v_limit + 1),
    max(q.value) filter (where q.page_pos = v_limit),
    max(q.username_normalized) filter (where q.page_pos = v_limit),
    max(q.public_id) filter (where q.page_pos = v_limit)
  into v_rows, v_has_more, v_last_value, v_last_u, v_last_p
  from (
    select
      r.*,
      row_number() over (
        order by r.value desc, r.username_normalized asc, r.public_id asc
      ) as page_pos
    from (
      select
        dense_rank() over (order by e.value desc) as rank,
        e.username,
        e.value,
        e.public_id::text as public_id,
        e.username_normalized
      from (
        select
          pp.public_id,
          pp.username,
          coalesce(pp.username_normalized, lower(pp.username)) as username_normalized,
          case v_board
            -- Longest all-mode run (max), not live current.
            when 'all_mode_streak' then uss.all_max_streak
            when 'longest_streak' then uss.any_max_streak
            when 'current_streak' then app_private.live_current_streak(
              uss.any_current_streak,
              uss.last_any_date_key,
              v_today,
              '{}'::text[]
            )
          end as value
        from public.user_streak_summary uss
        join public.public_profiles pp on pp.user_id = uss.user_id
        where app_private.is_leaderboard_eligible(uss.user_id)
          and pp.username is not null
          and case v_board
            when 'all_mode_streak' then uss.all_max_streak
            when 'longest_streak' then uss.any_max_streak
            when 'current_streak' then app_private.live_current_streak(
              uss.any_current_streak,
              uss.last_any_date_key,
              v_today,
              '{}'::text[]
            )
          end > 0
      ) e
    ) r
    where v_cursor_value is null
       or r.value < v_cursor_value
       or (
         r.value = v_cursor_value
         and r.username_normalized > v_cursor_u
       )
       or (
         r.value = v_cursor_value
         and r.username_normalized = v_cursor_u
         and r.public_id > v_cursor_p
       )
  ) q
  where q.page_pos <= v_limit + 1;

  if v_has_more and v_last_value is not null then
    v_next := encode(
      convert_to(
        jsonb_build_object(
          'v', 1,
          'board', v_board,
          'value', v_last_value,
          'u', v_last_u,
          'p', v_last_p
        )::text,
        'utf8'
      ),
      'base64'
    );
  else
    v_has_more := false;
    v_next := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'board', v_board,
    'entries', v_rows,
    'next_cursor', v_next,
    'has_more', coalesce(v_has_more, false)
  );
end;
$$;

create or replace function public.get_my_leaderboard_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_eligible boolean;
  v_summary public.user_streak_summary%rowtype;
  v_username text;
  v_public_id uuid;
  v_today text := public.current_utc_date_key();
  v_neutral text[];
  v_any_current integer;
  v_all_current integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  v_eligible := app_private.is_leaderboard_eligible(v_uid);
  select * into v_summary from public.user_streak_summary where user_id = v_uid;
  select pp.username, pp.public_id into v_username, v_public_id
  from public.public_profiles pp where pp.user_id = v_uid;

  v_neutral := app_private.collect_neutral_all_mode_dates(
    app_private.leaderboard_epoch_date(),
    v_today
  );
  v_any_current := app_private.live_current_streak(
    coalesce(v_summary.any_current_streak, 0),
    v_summary.last_any_date_key,
    v_today,
    '{}'::text[]
  );
  v_all_current := app_private.live_current_streak(
    coalesce(v_summary.all_current_streak, 0),
    v_summary.last_all_date_key,
    v_today,
    v_neutral
  );

  return jsonb_build_object(
    'ok', true,
    'eligible', v_eligible,
    'username', v_username,
    'public_id', v_public_id,
    'any_current_streak', v_any_current,
    'any_max_streak', coalesce(v_summary.any_max_streak, 0),
    'all_current_streak', v_all_current,
    'all_max_streak', coalesce(v_summary.all_max_streak, 0),
    'total_completions', coalesce(v_summary.total_completions, 0),
    'boards', jsonb_build_object(
      'all_mode_streak', jsonb_build_object(
        'value', coalesce(v_summary.all_max_streak, 0),
        'rank', case when v_eligible then (
          select dense_rank
          from (
            select
              uss.user_id,
              dense_rank() over (order by uss.all_max_streak desc) as dense_rank
            from public.user_streak_summary uss
            where app_private.is_leaderboard_eligible(uss.user_id)
              and uss.all_max_streak > 0
          ) x
          where x.user_id = v_uid
        ) else null end
      ),
      'longest_streak', jsonb_build_object(
        'value', coalesce(v_summary.any_max_streak, 0),
        'rank', case when v_eligible then (
          select dense_rank
          from (
            select
              uss.user_id,
              dense_rank() over (order by uss.any_max_streak desc) as dense_rank
            from public.user_streak_summary uss
            where app_private.is_leaderboard_eligible(uss.user_id)
              and uss.any_max_streak > 0
          ) x
          where x.user_id = v_uid
        ) else null end
      ),
      'current_streak', jsonb_build_object(
        'value', v_any_current,
        'rank', case when v_eligible then (
          select dense_rank
          from (
            select
              uss.user_id,
              dense_rank() over (
                order by app_private.live_current_streak(
                  uss.any_current_streak,
                  uss.last_any_date_key,
                  v_today,
                  '{}'::text[]
                ) desc
              ) as dense_rank
            from public.user_streak_summary uss
            where app_private.is_leaderboard_eligible(uss.user_id)
              and app_private.live_current_streak(
                uss.any_current_streak,
                uss.last_any_date_key,
                v_today,
                '{}'::text[]
              ) > 0
          ) x
          where x.user_id = v_uid
        ) else null end
      )
    )
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

create or replace function public.get_my_today_mode_completions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := public.current_utc_date_key();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  return jsonb_build_object(
    'ok', true,
    'date_key', v_today,
    'modes', coalesce(
      (
        select jsonb_agg(dc.mode order by dc.mode)
        from public.daily_completions dc
        where dc.user_id = v_uid
          and dc.date_key = v_today
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner moderation RPCs for status / exemptions / flags
-- ---------------------------------------------------------------------------

create or replace function public.moderation_get_site_status(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  return public.get_public_site_status()
    || jsonb_build_object(
      'exemptions', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'date_key', e.date_key,
              'mode', e.mode,
              'reason', e.reason,
              'created_at', e.created_at
            )
            order by e.date_key desc, e.mode
          )
          from public.mode_outage_exemptions e
        ),
        '[]'::jsonb
      ),
      'modes_full', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'mode', ms.mode,
              'available', ms.available,
              'message', ms.message,
              'required_for_all_mode', ms.required_for_all_mode
            )
            order by ms.mode
          )
          from public.mode_status ms
        ),
        '[]'::jsonb
      )
    );
end;
$$;

create or replace function public.moderation_set_site_status(
  p_actor_id uuid,
  p_banner_message text default null,
  p_banner_severity text default null,
  p_maintenance_active boolean default null,
  p_leaderboard_epoch_date text default null,
  p_clear_banner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_row public.site_status%rowtype;
  v_old_epoch text;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_banner_severity is not null
     and p_banner_severity not in ('info', 'warning', 'critical') then
    raise exception 'invalid_severity' using errcode = '22023';
  end if;

  if p_leaderboard_epoch_date is not null then
    if not app_private.is_valid_utc_date_key(p_leaderboard_epoch_date) then
      raise exception 'invalid_epoch' using errcode = '22023';
    end if;

    select s.leaderboard_epoch_date into v_old_epoch
    from public.site_status s where s.id = 1;

    if p_leaderboard_epoch_date is distinct from v_old_epoch then
      -- Epoch changes silently rewrite board history without a set-based rebuild.
      -- Reject once any production completion/activity exists.
      if exists (select 1 from public.daily_completions limit 1)
         or exists (select 1 from public.user_day_activity limit 1)
         or exists (select 1 from public.user_streak_summary limit 1) then
        raise exception
          'epoch_locked: leaderboard_epoch_date cannot change after production activity; rebuild required'
          using errcode = '23514';
      end if;
    end if;
  end if;

  update public.site_status s
  set
    banner_message = case
      when p_clear_banner then null
      when p_banner_message is not null then nullif(trim(p_banner_message), '')
      else s.banner_message
    end,
    banner_severity = coalesce(p_banner_severity, s.banner_severity),
    maintenance_active = coalesce(p_maintenance_active, s.maintenance_active),
    leaderboard_epoch_date = coalesce(p_leaderboard_epoch_date, s.leaderboard_epoch_date),
    updated_at = timezone('utc', now()),
    updated_by = p_actor_id
  where s.id = 1
  returning * into v_row;

  perform app_private.audit_moderation(
    p_actor_id,
    p_actor_id,
    'set_site_status',
    'site status update',
    jsonb_build_object(
      'banner_message', v_row.banner_message,
      'banner_severity', v_row.banner_severity,
      'maintenance_active', v_row.maintenance_active,
      'leaderboard_epoch_date', v_row.leaderboard_epoch_date
    )
  );

  return public.moderation_get_site_status(p_actor_id);
end;
$$;

create or replace function public.moderation_set_mode_status(
  p_actor_id uuid,
  p_mode text,
  p_available boolean default null,
  p_message text default null,
  p_required_for_all_mode boolean default null,
  p_clear_message boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_required_count integer;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;

  update public.mode_status ms
  set
    available = coalesce(p_available, ms.available),
    message = case
      when p_clear_message then null
      when p_message is not null then nullif(trim(p_message), '')
      else ms.message
    end,
    required_for_all_mode = coalesce(p_required_for_all_mode, ms.required_for_all_mode),
    updated_at = timezone('utc', now()),
    updated_by = p_actor_id
  where ms.mode = p_mode;

  select count(*)::integer into v_required_count
  from public.mode_status ms
  where ms.required_for_all_mode;

  if v_required_count < 1 then
    raise exception
      'invalid_mode_requirements: at least one mode must have required_for_all_mode; use outage exemptions for neutral days'
      using errcode = '22023';
  end if;

  perform app_private.audit_moderation(
    p_actor_id,
    p_actor_id,
    'set_mode_status',
    'mode status update',
    jsonb_build_object(
      'mode', p_mode,
      'available', p_available,
      'required_for_all_mode', p_required_for_all_mode
    )
  );

  return public.moderation_get_site_status(p_actor_id);
end;
$$;

create or replace function public.moderation_set_outage_exemption(
  p_actor_id uuid,
  p_date_key text,
  p_mode text,
  p_reason text,
  p_remove boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if not app_private.is_valid_utc_date_key(p_date_key) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;

  if p_remove then
    delete from public.mode_outage_exemptions
    where date_key = p_date_key and mode = p_mode;
  else
    if p_reason is null or length(trim(p_reason)) < 3 then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    insert into public.mode_outage_exemptions (date_key, mode, reason, created_by)
    values (p_date_key, p_mode, trim(p_reason), p_actor_id)
    on conflict (date_key, mode) do update set
      reason = excluded.reason,
      created_by = excluded.created_by,
      created_at = timezone('utc', now());
  end if;

  perform app_private.recompute_all_complete_for_date(p_date_key);

  perform app_private.audit_moderation(
    p_actor_id,
    p_actor_id,
    case when p_remove then 'remove_outage_exemption' else 'set_outage_exemption' end,
    coalesce(nullif(trim(p_reason), ''), 'outage exemption'),
    jsonb_build_object('date_key', p_date_key, 'mode', p_mode, 'remove', p_remove)
  );

  return public.moderation_get_site_status(p_actor_id);
end;
$$;

create or replace function public.moderation_set_account_flags(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_is_test boolean default null,
  p_is_suspicious boolean default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  if p_target_user_id is null then
    raise exception 'target_required' using errcode = '22023';
  end if;

  insert into app_private.account_flags (
    user_id, is_test, is_suspicious, notes, updated_at, updated_by
  ) values (
    p_target_user_id,
    coalesce(p_is_test, false),
    coalesce(p_is_suspicious, false),
    p_notes,
    timezone('utc', now()),
    p_actor_id
  )
  on conflict (user_id) do update set
    is_test = coalesce(p_is_test, app_private.account_flags.is_test),
    is_suspicious = coalesce(p_is_suspicious, app_private.account_flags.is_suspicious),
    notes = coalesce(p_notes, app_private.account_flags.notes),
    updated_at = timezone('utc', now()),
    updated_by = p_actor_id;

  perform app_private.audit_moderation(
    p_actor_id,
    p_target_user_id,
    'set_account_flags',
    'account flags update',
    jsonb_build_object(
      'is_test', p_is_test,
      'is_suspicious', p_is_suspicious
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- Grants
revoke all on function app_private.is_valid_utc_date_key(text) from public, anon, authenticated;
revoke all on function app_private.leaderboard_epoch_date() from public, anon, authenticated;
revoke all on function app_private.shift_utc_date_key(text, integer) from public, anon, authenticated;
revoke all on function app_private.effective_required_modes(text) from public, anon, authenticated;
revoke all on function app_private.is_neutral_all_mode_date(text) from public, anon, authenticated;
revoke all on function app_private.collect_neutral_all_mode_dates(text, text) from public, anon, authenticated;
revoke all on function app_private.only_neutral_between(text, text, text[]) from public, anon, authenticated;
revoke all on function app_private.is_streak_currently_active(text, text, text[]) from public, anon, authenticated;
revoke all on function app_private.live_current_streak(integer, text, text, text[]) from public, anon, authenticated;
revoke all on function app_private.is_leaderboard_eligible(uuid) from public, anon, authenticated;
revoke all on function app_private.compute_streak_from_dates(text[], text, text[]) from public, anon, authenticated;
revoke all on function app_private.refresh_user_day_activity(uuid, text) from public, anon, authenticated;
revoke all on function app_private.refresh_user_streak_summary(uuid) from public, anon, authenticated;
revoke all on function app_private.award_achievements(uuid) from public, anon, authenticated;
revoke all on function app_private.on_daily_completion_insert() from public, anon, authenticated;
revoke all on function app_private.recompute_all_complete_for_date(text) from public, anon, authenticated;
revoke all on function app_private.reconcile_stale_current_streaks(integer) from public, anon, authenticated;
revoke all on function app_private.snapshot_daily_mode_requirements() from public, anon, authenticated;
revoke all on function app_private.forbid_daily_mode_requirements_mutation() from public, anon, authenticated;

grant execute on function app_private.leaderboard_epoch_date() to postgres, service_role;
grant execute on function app_private.is_leaderboard_eligible(uuid) to postgres, service_role;
grant execute on function app_private.reconcile_stale_current_streaks(integer) to postgres, service_role;

revoke all on function public.get_public_site_status() from public;
revoke all on function public.get_leaderboard(text, integer, text) from public;
revoke all on function public.get_my_leaderboard_standing() from public;
revoke all on function public.get_my_achievements() from public;
revoke all on function public.get_my_today_mode_completions() from public;
revoke all on function public.moderation_get_site_status(uuid) from public, anon, authenticated;
revoke all on function public.moderation_set_site_status(uuid, text, text, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.moderation_set_mode_status(uuid, text, boolean, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.moderation_set_outage_exemption(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.moderation_set_account_flags(uuid, uuid, boolean, boolean, text) from public, anon, authenticated;

grant execute on function public.get_public_site_status() to anon, authenticated, service_role;
grant execute on function public.get_leaderboard(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.get_my_leaderboard_standing() to authenticated, service_role;
grant execute on function public.get_my_achievements() to authenticated, service_role;
grant execute on function public.get_my_today_mode_completions() to authenticated, service_role;
grant execute on function public.moderation_get_site_status(uuid) to service_role;
grant execute on function public.moderation_set_site_status(uuid, text, text, boolean, text, boolean) to service_role;
grant execute on function public.moderation_set_mode_status(uuid, text, boolean, text, boolean, boolean) to service_role;
grant execute on function public.moderation_set_outage_exemption(uuid, text, text, text, boolean) to service_role;
grant execute on function public.moderation_set_account_flags(uuid, uuid, boolean, boolean, text) to service_role;

comment on function public.get_leaderboard(text, integer, text) is
  'Public community boards with dense ranks and opaque keyset cursors. '
  'all_mode_streak uses all_max_streak. current_streak applies live UTC decay '
  '(today/yesterday grace; stored summaries may lag). Excludes non-opt-in and '
  'restricted accounts. Not competitive-proof while answer IDs are client-readable.';

comment on function public.get_my_leaderboard_standing() is
  'Own standing with live current-streak decay. all_mode_streak board value is all_max_streak.';

-- ---------------------------------------------------------------------------
-- Backfill: requirement snapshots + derived activity/streaks/achievements
-- ---------------------------------------------------------------------------

-- Snapshot modes that actually existed on each puzzle date (immutable thereafter).
insert into public.daily_mode_requirements (date_key, required_modes)
select s.date_key, s.modes
from (
  select
    dp.date_key,
    array_agg(distinct dp.mode order by dp.mode) as modes
  from public.daily_puzzles dp
  group by dp.date_key
) s
where cardinality(s.modes) >= 1
on conflict (date_key) do nothing;

-- Rebuild day activity from existing completions (idempotent upsert).
do $backfill$
declare
  v_uid uuid;
  v_date text;
  v_epoch text := app_private.leaderboard_epoch_date();
begin
  for v_uid, v_date in
    select distinct dc.user_id, dc.date_key
    from public.daily_completions dc
    where dc.date_key >= v_epoch
    order by dc.user_id, dc.date_key
  loop
    perform app_private.refresh_user_day_activity(v_uid, v_date);
  end loop;

  for v_uid in
    select distinct dc.user_id
    from public.daily_completions dc
    where dc.date_key >= v_epoch
  loop
    perform app_private.refresh_user_streak_summary(v_uid);
    perform app_private.award_achievements(v_uid);
  end loop;
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- complete_daily_mode: server-enforce mode availability (strict)
-- ---------------------------------------------------------------------------
-- Strict behavior:
--   * mode_status.available=false rejects completion for that mode (SQLSTATE 22023).
--   * Client "already started" rounds are NOT a server grant — progress that began
--     while available still cannot complete after an outage flip.
--   * Outage exemptions affect all-mode requirement snapshots only, not playability.
--   * Existing completion rows remain immutable; RPC stays idempotent on unique key.
-- ---------------------------------------------------------------------------

create or replace function public.complete_daily_mode(
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
  v_date_key text := public.current_utc_date_key();
  v_max_guesses constant integer := 6;
  v_hints integer := coalesce(p_hints_used, 0);
  v_hard boolean := coalesce(p_hard_mode, false);
  v_surrendered boolean := coalesce(p_surrendered, false);
  v_guess_ids integer[] := coalesce(p_guess_ids, '{}'::integer[]);
  v_guess_count integer;
  v_answer_id integer;
  v_character_id integer;
  v_answer_hits integer;
  v_answer_pos integer;
  v_outcome text;
  v_existing public.daily_completions%rowtype;
  v_inserted boolean := false;
  v_mode_available boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if app_private.is_cloud_banned(v_uid) then
    raise exception 'Cloud banned'
      using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'Invalid mode'
      using errcode = '22023';
  end if;

  -- Idempotent return for an already-recorded completion (even if mode later goes unavailable).
  select *
  into v_existing
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if found then
    return jsonb_build_object(
      'ok', true,
      'inserted', false,
      'date_key', v_existing.date_key,
      'mode', v_existing.mode,
      'taste', v_existing.taste,
      'outcome', v_existing.outcome,
      'guess_count', v_existing.guess_count,
      'hints_used', v_existing.hints_used,
      'hard_mode', v_existing.hard_mode,
      'surrendered', v_existing.surrendered,
      'completed_at', v_existing.completed_at
    );
  end if;

  select ms.available into v_mode_available
  from public.mode_status ms
  where ms.mode = p_mode;

  if coalesce(v_mode_available, false) is not true then
    raise exception 'Mode unavailable'
      using errcode = '22023';
  end if;

  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    raise exception 'Invalid taste'
      using errcode = '22023';
  end if;

  if v_hints < 0 or v_hints > v_max_guesses then
    raise exception 'Invalid hints_used'
      using errcode = '22023';
  end if;

  v_guess_count := coalesce(cardinality(v_guess_ids), 0);
  if v_guess_count > v_max_guesses then
    raise exception 'Too many guesses'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_guess_ids) as g(id)
    where g.id is null or g.id <= 0
  ) then
    raise exception 'Invalid guess id'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_guess_ids) as g(id)
    group by g.id
    having count(*) > 1
  ) then
    raise exception 'Duplicate guesses are not allowed'
      using errcode = '22023';
  end if;

  perform public.ensure_daily_puzzles(v_date_key);

  select dp.answer_id, dp.character_id
  into v_answer_id, v_character_id
  from public.daily_puzzles dp
  where dp.date_key = v_date_key
    and dp.mode = p_mode
    and dp.taste = p_taste;

  if v_answer_id is null then
    raise exception 'Daily puzzle unavailable for mode/taste'
      using errcode = 'P0002';
  end if;

  select count(*), min(ord)
  into v_answer_hits, v_answer_pos
  from unnest(v_guess_ids) with ordinality as g(id, ord)
  where g.id = v_answer_id;

  v_answer_hits := coalesce(v_answer_hits, 0);

  if v_answer_hits > 0 then
    if v_surrendered then
      raise exception 'Cannot surrender after a correct guess'
        using errcode = '22023';
    end if;
    if v_answer_hits <> 1 or v_answer_pos <> v_guess_count then
      raise exception 'Correct answer must be the final guess'
        using errcode = '22023';
    end if;
    v_outcome := 'won';
  else
    if v_surrendered then
      if v_guess_count >= v_max_guesses then
        raise exception 'Surrender requires fewer than max guesses'
          using errcode = '22023';
      end if;
      v_outcome := 'lost';
    else
      if v_guess_count <> v_max_guesses then
        raise exception 'Loss requires max guesses or surrender'
          using errcode = '22023';
      end if;
      v_outcome := 'lost';
    end if;
  end if;

  select *
  into v_existing
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if found then
    return jsonb_build_object(
      'ok', true,
      'inserted', false,
      'date_key', v_existing.date_key,
      'mode', v_existing.mode,
      'taste', v_existing.taste,
      'outcome', v_existing.outcome,
      'guess_count', v_existing.guess_count,
      'hints_used', v_existing.hints_used,
      'hard_mode', v_existing.hard_mode,
      'surrendered', v_existing.surrendered,
      'completed_at', v_existing.completed_at
    );
  end if;

  begin
    insert into public.daily_completions (
      user_id,
      date_key,
      mode,
      taste,
      outcome,
      guess_count,
      hints_used,
      hard_mode,
      surrendered,
      answer_id,
      character_id,
      guess_ids,
      max_guesses
    ) values (
      v_uid,
      v_date_key,
      p_mode,
      p_taste,
      v_outcome,
      v_guess_count,
      v_hints,
      v_hard,
      v_surrendered,
      v_answer_id,
      v_character_id,
      v_guess_ids,
      v_max_guesses
    )
    returning * into v_existing;
    v_inserted := true;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.daily_completions dc
      where dc.user_id = v_uid
        and dc.date_key = v_date_key
        and dc.mode = p_mode;
      v_inserted := false;
  end;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'date_key', v_existing.date_key,
    'mode', v_existing.mode,
    'taste', v_existing.taste,
    'outcome', v_existing.outcome,
    'guess_count', v_existing.guess_count,
    'hints_used', v_existing.hints_used,
    'hard_mode', v_existing.hard_mode,
    'surrendered', v_existing.surrendered,
    'completed_at', v_existing.completed_at
  );
end;
$$;

comment on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) is
  'Records an immutable daily completion. Strict: rejects when mode_status.available '
  'is false, including in-progress client rounds. Idempotent on (user, date, mode). '
  'Community integrity only — not cheat-proof while answer IDs are client-readable.';

revoke all on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) from public;
grant execute on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean)
  to authenticated, service_role;