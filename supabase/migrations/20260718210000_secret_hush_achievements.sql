-- Secret / Hush-Hush milestones: claim + progress events (cheat-tolerant by design).

-- ---------------------------------------------------------------------------
-- Schema: secret category + progress counters
-- ---------------------------------------------------------------------------

alter table public.achievement_definitions
  drop constraint if exists achievement_definitions_category_check;

alter table public.achievement_definitions
  add constraint achievement_definitions_category_check
  check (category = any (array[
    'completions'::text,
    'streak'::text,
    'all_mode'::text,
    'visit'::text,
    'secret'::text
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
    'visit_long_comebacks'::text,
    'secret_flag'::text
  ]));

create table if not exists public.user_secret_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  counter_key text not null,
  value integer not null default 0 check (value >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, counter_key)
);

comment on table public.user_secret_counters is
  'Progress counters for secret milestones (menu opens, refreshes, modes touched).';

alter table public.user_secret_counters enable row level security;
revoke all on table public.user_secret_counters from public, anon, authenticated;
grant all on table public.user_secret_counters to service_role;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

insert into public.achievement_definitions
  (id, version, title, description, category, metric, threshold, active, point_reward)
values
  ('secret_konami', 1, 'Cheat Code',
   'The ancient sequence still works.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_background', 1, 'Background Cultivation',
   'You left the cave door open.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_authors_note', 1, 'Author''s Note',
   'Please read before the next chapter.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_shopaholic', 1, 'Shopaholic Awakening',
   'Window shopping counts as training.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_tourist', 1, 'Milestone Tourist',
   'You came to stare at the trophies.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_hard_mode', 1, 'Hard Mode Curious',
   'You flipped the forbidden toggle.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_hint_denied', 1, 'Hint Denied',
   'Pride is a cultivation resource.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_surrender', 1, 'Panic Surrender',
   'The dungeon wins today.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_perfect', 1, 'Perfect Panel',
   'First try. No revisions.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_last_second', 1, 'Last Second',
   'The timer was a suggestion.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_night_owl', 1, 'Night Owl',
   'Sleep is filler.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_four_roads', 1, 'Four Roads',
   'You tried every gate in one sitting.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_lurker', 1, 'Leaderboard Lurker',
   'You checked the rankings without climbing.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_identity', 1, 'Identity Crisis',
   'New name, same protagonist.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_reauth', 1, 'Return of the King',
   'Signed out, signed in, still you.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_idle', 1, 'Idle Immortal',
   'AFK in the sect lobby.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_refresh', 1, 'Refresh Ritual',
   'You hit the formation again.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_dark', 1, 'Dark Formation',
   'The panel prefers the shadows.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_share', 1, 'Share the Spoilers',
   'You posted the panel.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_wrong_genre', 1, 'Wrong Genre',
   'That title is from another timeline.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_speedrun', 1, 'Speedrun Arc',
   'Chapter cleared before the OP ended.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_slow_burn', 1, 'Slow Burn',
   'You took the scenic route.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_tab_twin', 1, 'Tab Twin',
   'Split consciousness technique.',
   'secret', 'secret_flag', 1, true, 50),
  ('secret_escapist', 1, 'Escapist',
   'You closed the modal like it owed you money.',
   'secret', 'secret_flag', 1, true, 25),
  ('secret_account_menu', 1, 'Ten Curtain Calls',
   'You opened the account menu ten times.',
   'secret', 'secret_flag', 1, true, 25)
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
-- Award helper: insert secret achievement + points
-- ---------------------------------------------------------------------------

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

  if found and v_def.point_reward > 0 then
    perform app_private.apply_point_transaction(
      p_user_id,
      v_def.point_reward,
      'achievement',
      v_def.id,
      jsonb_build_object('achievement_id', v_def.id, 'version', v_def.version)
    );
  end if;

  return found;
end;
$$;

revoke all on function app_private.try_award_secret(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.try_award_secret(uuid, text)
  to postgres, service_role;

create or replace function app_private.bump_secret_counter(
  p_user_id uuid,
  p_key text,
  p_by integer default 1
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_value integer;
begin
  insert into public.user_secret_counters (user_id, counter_key, value, updated_at)
  values (p_user_id, p_key, greatest(p_by, 0), timezone('utc', now()))
  on conflict (user_id, counter_key) do update set
    value = public.user_secret_counters.value + greatest(p_by, 0),
    updated_at = timezone('utc', now())
  returning value into v_value;

  return coalesce(v_value, 0);
end;
$$;

revoke all on function app_private.bump_secret_counter(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function app_private.bump_secret_counter(uuid, text, integer)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Public RPC: report secret event
-- ---------------------------------------------------------------------------

create or replace function public.report_secret_event(
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_event text := lower(trim(coalesce(p_event, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_awarded text[] := '{}'::text[];
  v_count integer;
  v_mode text;
  v_key text;
  v_hour integer;
  v_existing integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if v_event = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  case v_event
    when 'konami' then
      if app_private.try_award_secret(v_uid, 'secret_konami') then
        v_awarded := array_append(v_awarded, 'secret_konami');
      end if;

    when 'tab_open_24h' then
      if app_private.try_award_secret(v_uid, 'secret_background') then
        v_awarded := array_append(v_awarded, 'secret_background');
      end if;

    when 'legal_visit' then
      if app_private.try_award_secret(v_uid, 'secret_authors_note') then
        v_awarded := array_append(v_awarded, 'secret_authors_note');
      end if;

    when 'shop_visit' then
      if app_private.try_award_secret(v_uid, 'secret_shopaholic') then
        v_awarded := array_append(v_awarded, 'secret_shopaholic');
      end if;

    when 'milestones_tourist' then
      select count(*)::integer into v_existing
      from public.user_achievements ua
      join public.achievement_definitions d on d.id = ua.achievement_id
      where ua.user_id = v_uid
        and d.category in ('completions', 'streak', 'all_mode');
      if v_existing = 0 then
        if app_private.try_award_secret(v_uid, 'secret_tourist') then
          v_awarded := array_append(v_awarded, 'secret_tourist');
        end if;
      end if;

    when 'hard_mode_on' then
      if app_private.try_award_secret(v_uid, 'secret_hard_mode') then
        v_awarded := array_append(v_awarded, 'secret_hard_mode');
      end if;

    when 'night_owl' then
      v_hour := coalesce((v_payload ->> 'local_hour')::integer, -1);
      if v_hour >= 0 and v_hour < 5 then
        if app_private.try_award_secret(v_uid, 'secret_night_owl') then
          v_awarded := array_append(v_awarded, 'secret_night_owl');
        end if;
      end if;

    when 'leaderboard_view' then
      if app_private.try_award_secret(v_uid, 'secret_lurker') then
        v_awarded := array_append(v_awarded, 'secret_lurker');
      end if;

    when 'reauth' then
      if app_private.try_award_secret(v_uid, 'secret_reauth') then
        v_awarded := array_append(v_awarded, 'secret_reauth');
      end if;

    when 'idle_home' then
      if app_private.try_award_secret(v_uid, 'secret_idle') then
        v_awarded := array_append(v_awarded, 'secret_idle');
      end if;

    when 'home_refresh' then
      v_key := 'home_refresh:' || public.current_utc_date_key();
      v_count := app_private.bump_secret_counter(v_uid, v_key, 1);
      if v_count >= 5 then
        if app_private.try_award_secret(v_uid, 'secret_refresh') then
          v_awarded := array_append(v_awarded, 'secret_refresh');
        end if;
      end if;

    when 'dark_theme' then
      if app_private.try_award_secret(v_uid, 'secret_dark') then
        v_awarded := array_append(v_awarded, 'secret_dark');
      end if;

    when 'share_result' then
      if app_private.try_award_secret(v_uid, 'secret_share') then
        v_awarded := array_append(v_awarded, 'secret_share');
      end if;

    when 'wrong_genre' then
      if app_private.try_award_secret(v_uid, 'secret_wrong_genre') then
        v_awarded := array_append(v_awarded, 'secret_wrong_genre');
      end if;

    when 'speedrun' then
      if coalesce((v_payload ->> 'elapsed_ms')::integer, 999999) <= 60000 then
        if app_private.try_award_secret(v_uid, 'secret_speedrun') then
          v_awarded := array_append(v_awarded, 'secret_speedrun');
        end if;
      end if;

    when 'tab_twin' then
      if app_private.try_award_secret(v_uid, 'secret_tab_twin') then
        v_awarded := array_append(v_awarded, 'secret_tab_twin');
      end if;

    when 'escape_modal' then
      if app_private.try_award_secret(v_uid, 'secret_escapist') then
        v_awarded := array_append(v_awarded, 'secret_escapist');
      end if;

    when 'account_menu_open' then
      v_count := app_private.bump_secret_counter(v_uid, 'account_menu_open', 1);
      if v_count >= 10 then
        if app_private.try_award_secret(v_uid, 'secret_account_menu') then
          v_awarded := array_append(v_awarded, 'secret_account_menu');
        end if;
      end if;

    when 'mode_open' then
      v_mode := lower(trim(coalesce(v_payload ->> 'mode', '')));
      if v_mode in ('summary', 'character', 'cover', 'heardle') then
        v_key := 'mode_open:' || public.current_utc_date_key() || ':' || v_mode;
        -- Idempotent per mode/day: only first open bumps the distinct set size.
        insert into public.user_secret_counters (user_id, counter_key, value, updated_at)
        values (v_uid, v_key, 1, timezone('utc', now()))
        on conflict (user_id, counter_key) do nothing;
        if found then
          v_count := app_private.bump_secret_counter(
            v_uid,
            'mode_open_distinct:' || public.current_utc_date_key(),
            1
          );
          if v_count >= 4 then
            if app_private.try_award_secret(v_uid, 'secret_four_roads') then
              v_awarded := array_append(v_awarded, 'secret_four_roads');
            end if;
          end if;
        end if;
      end if;

    else
      return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end case;

  return jsonb_build_object(
    'ok', true,
    'event', v_event,
    'awarded', to_jsonb(v_awarded)
  );
end;
$$;

comment on function public.report_secret_event(text, jsonb) is
  'Authenticated hush-hush progress reporter. Intentionally client-triggered; competitive ladders stay separate.';

revoke all on function public.report_secret_event(text, jsonb) from public, anon;
grant execute on function public.report_secret_event(text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Completion-derived secrets (server-verified)
-- ---------------------------------------------------------------------------

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
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_hour integer;
begin
  if p_hard_mode then
    perform app_private.try_award_secret(p_user_id, 'secret_hard_mode');
  end if;

  if p_surrendered then
    perform app_private.try_award_secret(p_user_id, 'secret_surrender');
  end if;

  if p_outcome = 'won' and not p_surrendered then
    if coalesce(p_hints_used, 0) = 0 then
      perform app_private.try_award_secret(p_user_id, 'secret_hint_denied');
    end if;
    if p_guess_count = 1 then
      perform app_private.try_award_secret(p_user_id, 'secret_perfect');
    end if;
    if p_guess_count = p_max_guesses then
      perform app_private.try_award_secret(p_user_id, 'secret_slow_burn');
    end if;
  end if;

  -- Final hour before day rollover (server clock).
  v_hour := extract(hour from timezone('utc', p_completed_at))::integer;
  if v_hour = 23 then
    perform app_private.try_award_secret(p_user_id, 'secret_last_second');
  end if;
end;
$$;

revoke all on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) to postgres, service_role;

-- Patch completion insert trigger function to also award secrets.
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

-- Identity Crisis on username change (public_profiles)
create or replace function app_private.after_username_change_award_secret()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and new.username is distinct from old.username
     and old.username is not null
     and new.username is not null then
    perform app_private.try_award_secret(new.user_id, 'secret_identity');
  end if;
  return new;
end;
$$;

drop trigger if exists public_profiles_after_username_change_secret on public.public_profiles;
create trigger public_profiles_after_username_change_secret
  after update of username on public.public_profiles
  for each row
  execute function app_private.after_username_change_award_secret();
