-- Ten Curtain Calls: no server-side press counter.
-- Client counts 10 presses in-tab, then fires a one-shot claim (like other hush secrets).

drop function if exists app_private.note_account_menu_press(uuid, integer);

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

update public.achievement_definitions
set description = 'You pressed the account button ten times in one sitting.'
where id = 'secret_account_menu';

-- Drop leftover server progress rows for this secret (no longer used).
delete from public.user_secret_counters
where counter_key = 'account_menu_open';
