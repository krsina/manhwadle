-- Harden achievement-adjacent RPCs against spam and client-trusted free grants.
-- Goals:
--   1) Keep awards idempotent (PK + point ledger uniqueness already enforce this).
--   2) Stop signed-in users from flooding visit/secret RPCs (rate limits + early exits).
--   3) Remove client-attested Cascade claim (`multi_unlock`); Cascade stays server-counted.
--   4) Require a recent verified win before accepting speedrun claims.

-- ---------------------------------------------------------------------------
-- Per-user RPC rate windows (private; no client access)
-- ---------------------------------------------------------------------------

create table if not exists app_private.rpc_rate_windows (
  user_id uuid not null references auth.users (id) on delete cascade,
  rpc_name text not null,
  window_started_at timestamptz not null,
  call_count integer not null default 0
    check (call_count >= 0),
  primary key (user_id, rpc_name)
);

alter table app_private.rpc_rate_windows enable row level security;

revoke all on table app_private.rpc_rate_windows
  from public, anon, authenticated;
grant all on table app_private.rpc_rate_windows to service_role;

create or replace function app_private.consume_rpc_rate_limit(
  p_user_id uuid,
  p_rpc_name text,
  p_max_calls integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_window_started timestamptz;
  v_count integer;
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  if p_user_id is null
     or p_rpc_name is null
     or btrim(p_rpc_name) = ''
     or p_max_calls is null
     or p_max_calls < 1 then
    return false;
  end if;

  insert into app_private.rpc_rate_windows (
    user_id, rpc_name, window_started_at, call_count
  ) values (
    p_user_id, p_rpc_name, v_now, 1
  )
  on conflict (user_id, rpc_name) do update
  set
    window_started_at = case
      when app_private.rpc_rate_windows.window_started_at <= v_now - v_window
        then v_now
      else app_private.rpc_rate_windows.window_started_at
    end,
    call_count = case
      when app_private.rpc_rate_windows.window_started_at <= v_now - v_window
        then 1
      else app_private.rpc_rate_windows.call_count + 1
    end
  returning window_started_at, call_count
  into v_window_started, v_count;

  return v_count <= p_max_calls;
end;
$$;

revoke all on function app_private.consume_rpc_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function app_private.consume_rpc_rate_limit(uuid, text, integer, integer)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- record_daily_visit: early-return when today's visit already exists
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

  if not app_private.consume_rpc_rate_limit(v_uid, 'record_daily_visit', 12, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- Cheap idempotent path: already recorded today → no summary refresh / award loop.
  if exists (
    select 1
    from public.user_day_visits udv
    where udv.user_id = v_uid
      and udv.date_key = v_today
  ) then
    return jsonb_build_object(
      'ok', true,
      'date_key', v_today,
      'recorded', false
    );
  end if;

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
  else
    -- Race with another concurrent ping: treat as already recorded.
    return jsonb_build_object(
      'ok', true,
      'date_key', v_today,
      'recorded', false
    );
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
  'Authenticated idempotent UTC visit ping. Early-returns when today is already recorded; rate-limited.';

revoke all on function public.record_daily_visit() from public, anon;
grant execute on function public.record_daily_visit() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- report_secret_event: rate limit, short-circuit owned one-shots, drop multi_unlock
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
  v_oneshot text;
  v_elapsed integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if v_event = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  -- Reject the former client-trusted Cascade claim path entirely.
  if v_event = 'multi_unlock' then
    return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'report_secret_event', 40, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- One-shot events: no-op (no counter bumps) once already owned.
  v_oneshot := case v_event
    when 'konami' then 'secret_konami'
    when 'tab_open_24h' then 'secret_background'
    when 'legal_visit' then 'secret_authors_note'
    when 'shop_visit' then 'secret_shopaholic'
    when 'hard_mode_on' then 'secret_hard_mode'
    when 'night_owl' then 'secret_night_owl'
    when 'leaderboard_view' then 'secret_lurker'
    when 'reauth' then 'secret_reauth'
    when 'idle_home' then 'secret_idle'
    when 'dark_theme' then 'secret_dark'
    when 'light_theme' then 'secret_lights'
    when 'share_result' then 'secret_share'
    when 'wrong_genre' then 'secret_wrong_genre'
    when 'speedrun' then 'secret_speedrun'
    when 'tab_twin' then 'secret_tab_twin'
    when 'escape_modal' then 'secret_escapist'
    when 'account_menu_open' then 'secret_account_menu'
    else null
  end;

  if v_oneshot is not null
     and exists (
       select 1
       from public.user_achievements ua
       where ua.user_id = v_uid
         and ua.achievement_id = v_oneshot
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  -- Counter-backed secrets: stop once owned (prevents unbounded counter growth).
  if v_event = 'home_refresh'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_refresh'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  if v_event = 'mode_open'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_four_roads'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  if v_event = 'milestones_tourist'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_tourist'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
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
      select usc.value into v_count
      from public.user_secret_counters usc
      where usc.user_id = v_uid
        and usc.counter_key = v_key;
      -- Cap counter growth once the threshold is met (award still idempotent).
      if coalesce(v_count, 0) < 5 then
        v_count := app_private.bump_secret_counter(v_uid, v_key, 1);
      end if;
      if coalesce(v_count, 0) >= 5 then
        if app_private.try_award_secret(v_uid, 'secret_refresh') then
          v_awarded := array_append(v_awarded, 'secret_refresh');
        end if;
      end if;

    when 'dark_theme' then
      if app_private.try_award_secret(v_uid, 'secret_dark') then
        v_awarded := array_append(v_awarded, 'secret_dark');
      end if;

    when 'light_theme' then
      if app_private.try_award_secret(v_uid, 'secret_lights') then
        v_awarded := array_append(v_awarded, 'secret_lights');
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
      -- Require a recent verified win so this cannot be claimed without playing.
      v_elapsed := coalesce((v_payload ->> 'elapsed_ms')::integer, 999999);
      if v_elapsed >= 0
         and v_elapsed <= 60000
         and exists (
           select 1
           from public.daily_completions dc
           where dc.user_id = v_uid
             and dc.outcome = 'won'
             and dc.surrendered is not true
             and dc.completed_at > timezone('utc', now()) - interval '2 minutes'
         ) then
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
      -- Progress is client-session only; this event is the one-shot claim.
      if app_private.try_award_secret(v_uid, 'secret_account_menu') then
        v_awarded := array_append(v_awarded, 'secret_account_menu');
      end if;

    when 'mode_open' then
      v_mode := lower(trim(coalesce(v_payload ->> 'mode', '')));
      if v_mode in ('summary', 'character', 'cover', 'heardle') then
        v_key := 'mode_open:' || public.current_utc_date_key() || ':' || v_mode;
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

  -- Any single RPC that grants 2+ secrets also earns Cascade (server-counted only).
  if coalesce(array_length(v_awarded, 1), 0) >= 2
     and not ('secret_cascade' = any (v_awarded)) then
    if app_private.try_award_secret(v_uid, 'secret_cascade') then
      v_awarded := array_append(v_awarded, 'secret_cascade');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event', v_event,
    'awarded', to_jsonb(v_awarded)
  );
end;
$$;

comment on function public.report_secret_event(text, jsonb) is
  'Authenticated hush-hush progress reporter. Rate-limited; one-shot short-circuit; Cascade is server-counted only.';

revoke all on function public.report_secret_event(text, jsonb) from public, anon;
grant execute on function public.report_secret_event(text, jsonb) to authenticated, service_role;
