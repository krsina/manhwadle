-- Do not award Hint Denied for a first-guess solve: a player who solves
-- immediately never made a meaningful choice to refuse a hint. This keeps a
-- first completion to Awakening + Perfect Panel, with Speedrun Arc remaining
-- the third exceptional award when the client reports a fast clear.
--
-- Full Party and Clean Sweep also used to unlock from the exact same first
-- full-clear day. Keep Full Party at day 1 and move Clean Sweep between Combo
-- (day 3) and Perfect Week (day 7), where it represents sustained sweeping.
update public.achievement_definitions
set
  threshold = 4,
  description = 'Reach a 4-day all-mode streak. Four straight sweeps. Receipts filed.'
where id = 'all_mode_streak_1'
  and version = 1;

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
    if coalesce(p_hints_used, 0) = 0
      and p_guess_count > 1
      and not coalesce(p_hard_mode, false)
    then
      perform app_private.try_award_secret(p_user_id, 'secret_hint_denied');
    end if;
    if p_guess_count = 1 and coalesce(p_hints_used, 0) = 0 then
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

comment on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) is
  'Awards completion-path Hush-Hush achievements; Hint Denied requires a normal-mode no-hint win after more than one guess.';
