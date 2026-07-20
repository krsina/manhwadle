-- Top Rankings: signed-in players with a public username always count.
-- leaderboard_visible is retained for export compatibility but no longer gates eligibility.

comment on table public.user_settings is
  'Private account settings (taste). leaderboard_visible is legacy and unused for eligibility.';

comment on column public.user_settings.leaderboard_visible is
  'Legacy opt-in flag. Ignored by is_leaderboard_eligible; signed-in play with a public username always counts.';

create or replace function app_private.is_leaderboard_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select
    app_private.can_appear_publicly(p_user_id)
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

comment on function app_private.is_leaderboard_eligible(uuid) is
  'True when the account may appear on Top Rankings (public username, not banned/excluded/flagged).';

-- Ignore p_leaderboard_visible so older clients cannot opt out.
create or replace function public.update_my_settings(
  p_reader_taste text default null,
  p_leaderboard_visible boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.user_settings%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  if p_reader_taste is not null
     and p_reader_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;

  -- p_leaderboard_visible is accepted for API compatibility but ignored (always-on).

  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  update public.user_settings us
  set
    reader_taste = coalesce(p_reader_taste, us.reader_taste),
    updated_at = timezone('utc', now())
  where us.user_id = v_uid
  returning * into v_settings;

  return jsonb_build_object(
    'ok', true,
    'reader_taste', v_settings.reader_taste,
    'leaderboard_visible', true
  );
end;
$$;

comment on function public.update_my_settings(text, boolean) is
  'Update private settings (reader taste). Leaderboard visibility is always on for eligible accounts.';

-- Keep account payload honest: visibility is always-on for eligible accounts.
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
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select * into v_profile from public.public_profiles where user_id = v_uid;
  select * into v_settings from public.user_settings where user_id = v_uid;
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
    'can_appear_publicly', app_private.can_appear_publicly(v_uid)
  );
end;
$$;

comment on function public.get_leaderboard(text, integer, text) is
  'Public Top Rankings with dense ranks and opaque keyset cursors. '
  'all_mode_streak uses all_max_streak. current_streak applies live UTC decay '
  '(today/yesterday grace; stored summaries may lag). Excludes restricted/flagged '
  'accounts. Not competitive-proof while answer IDs are client-readable.';
