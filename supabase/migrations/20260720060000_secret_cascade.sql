-- Hush-Hush: Cascade — unlock when multiple milestones drop in one award pass.

insert into public.achievement_definitions (
  id, version, title, description, category, metric, threshold, active, point_reward
) values
  (
    'secret_cascade',
    1,
    'Cascade',
    'Multiple seals dropped in one breath.',
    'secret',
    'secret_flag',
    1,
    true,
    50
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

-- Return type changes from void → integer require drop first.
drop function if exists app_private.award_achievements(uuid);
drop function if exists app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
);

-- Count newly inserted ladder awards; grant Cascade when 2+ land together.
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
  select * into v_summary from public.user_streak_summary where user_id = p_user_id;
  if not found then
    return 0;
  end if;

  for v_def in
    select *
    from public.achievement_definitions
    where active
      and category <> 'secret'
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

  if v_new_count >= 2 then
    perform app_private.try_award_secret(p_user_id, 'secret_cascade');
  end if;

  return v_new_count;
end;
$$;

revoke all on function app_private.award_achievements(uuid)
  from public, anon, authenticated;
grant execute on function app_private.award_achievements(uuid)
  to postgres, service_role;

-- Count completion-derived secrets; Cascade when 2+ secrets land together.
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
    if app_private.try_award_secret(p_user_id, 'secret_hard_mode') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if p_surrendered then
    if app_private.try_award_secret(p_user_id, 'secret_surrender') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if p_outcome = 'won' and not p_surrendered then
    if coalesce(p_hints_used, 0) = 0 then
      if app_private.try_award_secret(p_user_id, 'secret_hint_denied') then
        v_new_count := v_new_count + 1;
      end if;
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

  if v_new_count >= 2 then
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

-- Combine ladder + completion-secret bursts in one completion insert.
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
  -- 1 ladder + 1 secret (or any mix totaling 2+) still counts as a cascade.
  if (v_ladder + v_secrets) >= 2 then
    perform app_private.try_award_secret(new.user_id, 'secret_cascade');
  end if;
  return new;
end;
$$;

-- Client-reported multi-unlock (toast-batch / edge paths) + RPC-side burst.
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
  v_burst integer;
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

    when 'multi_unlock' then
      v_burst := coalesce((v_payload ->> 'count')::integer, 0);
      if v_burst >= 2 then
        if app_private.try_award_secret(v_uid, 'secret_cascade') then
          v_awarded := array_append(v_awarded, 'secret_cascade');
        end if;
      end if;

    else
      return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end case;

  -- Any single RPC that grants 2+ secrets also earns Cascade.
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
  'Authenticated hush-hush progress reporter. Intentionally client-triggered; competitive ladders stay separate.';

revoke all on function public.report_secret_event(text, jsonb) from public, anon;
grant execute on function public.report_secret_event(text, jsonb) to authenticated, service_role;
