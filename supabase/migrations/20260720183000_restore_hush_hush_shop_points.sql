-- Restore Hush-Hush shop points: easy discovery / UI = 50, harder secrets = 100.
-- Client-attested secrets remain one-shot + rate-limited; economic farm is accepted.

update public.achievement_definitions
set point_reward = case id
  -- Easy (50)
  when 'secret_authors_note' then 50
  when 'secret_shopaholic' then 50
  when 'secret_tourist' then 50
  when 'secret_hard_mode' then 50
  when 'secret_surrender' then 50
  when 'secret_lurker' then 50
  when 'secret_reauth' then 50
  when 'secret_refresh' then 50
  when 'secret_dark' then 50
  when 'secret_lights' then 50
  when 'secret_share' then 50
  when 'secret_wrong_genre' then 50
  when 'secret_escapist' then 50
  when 'secret_account_menu' then 50
  -- Harder (100)
  when 'secret_konami' then 100
  when 'secret_background' then 100
  when 'secret_hint_denied' then 100
  when 'secret_perfect' then 100
  when 'secret_last_second' then 100
  when 'secret_night_owl' then 100
  when 'secret_four_roads' then 100
  when 'secret_identity' then 100
  when 'secret_idle' then 100
  when 'secret_speedrun' then 100
  when 'secret_slow_burn' then 100
  when 'secret_tab_twin' then 100
  when 'secret_cascade' then 100
  else point_reward
end
where category = 'secret';

-- Grant points again on completion-path hush badges (hard mode / no-hint stay
-- out of Cascade counting — still not independently verified for multi-drop).
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

-- Client hush events grant definition point_reward again (one-shot + rate-limited).
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

  if v_event = 'multi_unlock' then
    return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'report_secret_event', 40, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_oneshot := case v_event
    when 'konami' then 'secret_konami'
    when 'tab_open_24h' then 'secret_background'
    when 'legal_visit' then 'secret_authors_note'
    when 'shop_visit' then 'secret_shopaholic'
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
      -- Unlock is server-gated via completions (award_secrets_from_completion).
      null;

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

  -- Do not award Cascade here: Cascade is granted only from
  -- app_private.award_achievements on verified completion / visit paths.

  return jsonb_build_object(
    'ok', true,
    'event', v_event,
    'awarded', to_jsonb(v_awarded)
  );
end;
$$;

comment on function public.report_secret_event(text, jsonb) is
  'Authenticated hush-hush progress reporter. One-shot awards grant definition point_reward. Rate-limited.';

revoke all on function public.report_secret_event(text, jsonb) from public, anon;
grant execute on function public.report_secret_event(text, jsonb)
  to authenticated, service_role;
