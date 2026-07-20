-- Identity / settings: public profiles, private settings, username RPCs.
-- Does not mutate remote until applied. app_private stays off the Data API.

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text,
  username_normalized text,
  username_changed_at timestamptz,
  username_change_required boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint public_profiles_username_pair check (
    (username is null and username_normalized is null)
    or (
      username is not null
      and username_normalized is not null
      and char_length(username) between 3 and 20
      and username ~ '^[A-Za-z0-9_]+$'
    )
  )
);

comment on table public.public_profiles is
  'Sanitized public identity. Username mutations only via SECURITY DEFINER RPCs.';

create unique index if not exists public_profiles_username_normalized_uidx
  on public.public_profiles (username_normalized)
  where username_normalized is not null;

drop trigger if exists public_profiles_set_updated_at on public.public_profiles;
create trigger public_profiles_set_updated_at
  before update on public.public_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reader_taste text
    check (
      reader_taste is null
      or reader_taste = any (array['action'::text, 'romance'::text, 'both'::text])
    ),
  leaderboard_visible boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.user_settings is
  'Private account settings (taste, leaderboard opt-in). Owner read/update only.';

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Leaderboard participation is opt-in and requires a valid public username.
-- This trigger protects direct table updates in addition to the RPC check.
create or replace function app_private.enforce_leaderboard_profile()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.leaderboard_visible and not exists (
    select 1
    from public.public_profiles pp
    where pp.user_id = new.user_id
      and pp.username is not null
      and not pp.username_change_required
  ) then
    raise exception 'username_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_require_public_profile on public.user_settings;
create trigger user_settings_require_public_profile
  before insert or update of leaderboard_visible on public.user_settings
  for each row execute function app_private.enforce_leaderboard_profile();

revoke all on function app_private.enforce_leaderboard_profile()
  from public, anon, authenticated;
grant execute on function app_private.enforce_leaderboard_profile()
  to postgres, service_role;

-- Migrate taste out of legacy profiles without dropping the old column yet.
insert into public.user_settings (user_id, reader_taste)
select p.user_id, p.reader_taste
from public.profiles p
on conflict (user_id) do update
set reader_taste = coalesce(public.user_settings.reader_taste, excluded.reader_taste);

create table if not exists app_private.username_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_username text,
  old_username_normalized text,
  new_username text,
  new_username_normalized text,
  reason text not null default 'self_service',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists username_history_user_id_idx
  on app_private.username_history (user_id, created_at desc);

create table if not exists app_private.blocked_username_terms (
  term_normalized text primary key,
  kind text not null
    check (kind = any (array['reserved'::text, 'profanity'::text, 'blocked'::text])),
  created_at timestamptz not null default timezone('utc', now())
);

-- Seed reserved + light profanity/blocked list (normalized / leet-folded forms).
insert into app_private.blocked_username_terms (term_normalized, kind) values
  ('admin', 'reserved'),
  ('administrator', 'reserved'),
  ('mod', 'reserved'),
  ('moderator', 'reserved'),
  ('owner', 'reserved'),
  ('support', 'reserved'),
  ('help', 'reserved'),
  ('staff', 'reserved'),
  ('official', 'reserved'),
  ('manhwadle', 'reserved'),
  ('system', 'reserved'),
  ('root', 'reserved'),
  ('null', 'reserved'),
  ('undefined', 'reserved'),
  ('anonymous', 'reserved'),
  ('guest', 'reserved'),
  ('api', 'reserved'),
  ('bot', 'reserved'),
  ('fuck', 'profanity'),
  ('fuk', 'profanity'),
  ('fock', 'profanity'),
  ('fvck', 'profanity'),
  ('shit', 'profanity'),
  ('asshole', 'profanity'),
  ('bitch', 'profanity'),
  ('cunt', 'profanity'),
  ('nigger', 'profanity'),
  ('nigga', 'profanity'),
  ('faggot', 'profanity'),
  ('retard', 'profanity'),
  ('rape', 'profanity'),
  ('porn', 'blocked'),
  ('sex', 'blocked')
on conflict (term_normalized) do nothing;

alter table public.public_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table app_private.username_history enable row level security;
alter table app_private.blocked_username_terms enable row level security;

-- No client policies on private tables (defense in depth).
revoke all on table app_private.username_history from public, anon, authenticated;
revoke all on table app_private.blocked_username_terms from public, anon, authenticated;
grant all on table app_private.username_history to postgres, service_role;
grant all on table app_private.blocked_username_terms to postgres, service_role;

-- public_profiles: own read only; public identity is exposed through narrow
-- leaderboard/profile RPCs so user UUIDs and normalized names stay private.
revoke all on table public.public_profiles from public;
revoke all on table public.public_profiles from anon, authenticated;
grant select on table public.public_profiles to authenticated;
grant all on table public.public_profiles to service_role;

drop policy if exists public_profiles_select_all on public.public_profiles;

drop policy if exists public_profiles_select_own on public.public_profiles;
create policy public_profiles_select_own
  on public.public_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- user_settings: owner read/update/insert (trigger creates rows; sync may upsert)
revoke all on table public.user_settings from public;
revoke all on table public.user_settings from anon, authenticated;
grant select, insert, update on table public.user_settings to authenticated;
grant all on table public.user_settings to service_role;

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Harden legacy profiles: keep row for compat, stop client taste as source of truth.
-- Still allow own read/update for display_name transition; prefer user_settings for taste.
revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Username helpers (private) + RPCs (public wrappers)
-- ---------------------------------------------------------------------------

create or replace function app_private.fold_username_confusables(p_input text)
returns text
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
declare
  s text := lower(coalesce(p_input, ''));
  i int;
  ch text;
  out text := '';
begin
  for i in 1..char_length(s) loop
    ch := substr(s, i, 1);
    out := out || case ch
      when '0' then 'o'
      when '1' then 'i'
      when '3' then 'e'
      when '4' then 'a'
      when '5' then 's'
      when '7' then 't'
      when '8' then 'b'
      when '9' then 'g'
      when '@' then 'a'
      when '$' then 's'
      when '!' then 'i'
      when '|' then 'i'
      else ch
    end;
  end loop;
  -- Strip underscores for denylist matching only.
  return replace(out, '_', '');
end;
$$;

create or replace function app_private.normalize_username(p_username text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select lower(trim(coalesce(p_username, '')));
$$;

create or replace function app_private.validate_username_candidate(p_username text)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  raw text := trim(coalesce(p_username, ''));
  norm text;
  folded text;
  term text;
begin
  if raw is null or raw = '' then
    return 'unavailable';
  end if;
  if char_length(raw) < 3 or char_length(raw) > 20 then
    return 'unavailable';
  end if;
  if raw !~ '^[A-Za-z0-9_]+$' then
    return 'unavailable';
  end if;

  norm := app_private.normalize_username(raw);
  folded := app_private.fold_username_confusables(raw);

  -- Reserved: exact normalized / folded match only.
  if exists (
    select 1
    from app_private.blocked_username_terms t
    where t.kind = 'reserved'
      and (t.term_normalized = norm or t.term_normalized = folded)
  ) then
    return 'unavailable';
  end if;

  -- Profanity / blocked: exact or substring on confusable-folded form.
  if exists (
    select 1
    from app_private.blocked_username_terms t
    where t.kind in ('profanity', 'blocked')
      and (
        t.term_normalized = norm
        or t.term_normalized = folded
        or position(t.term_normalized in folded) > 0
      )
  ) then
    return 'unavailable';
  end if;

  return null;
end;
$$;

create or replace function app_private.apply_username(
  p_user_id uuid,
  p_username text,
  p_is_change boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := p_user_id;
  v_raw text := trim(coalesce(p_username, ''));
  v_norm text;
  v_err text;
  v_row public.public_profiles%rowtype;
  v_next timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_err := app_private.validate_username_candidate(v_raw);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  v_norm := app_private.normalize_username(v_raw);

  select * into v_row
  from public.public_profiles pp
  where pp.user_id = v_uid
  for update;

  if p_is_change then
    if not found or v_row.username is null then
      return jsonb_build_object('ok', false, 'error', 'claim_required');
    end if;
    if v_row.username_change_required then
      -- Forced rename path uses claim-style replacement, not change.
      return jsonb_build_object('ok', false, 'error', 'claim_required');
    end if;
    if v_row.username_changed_at is not null
       and v_row.username_changed_at > (timezone('utc', now()) - interval '30 days') then
      v_next := v_row.username_changed_at + interval '30 days';
      return jsonb_build_object(
        'ok', false,
        'error', 'cooldown',
        'next_change_at', v_next
      );
    end if;
    if v_row.username_normalized = v_norm then
      return jsonb_build_object(
        'ok', true,
        'username', v_row.username,
        'unchanged', true,
        'next_change_at', case
          when v_row.username_changed_at is null then null
          else v_row.username_changed_at + interval '30 days'
        end
      );
    end if;
  else
    -- Claim / forced replacement
    if found and v_row.username is not null and not v_row.username_change_required then
      return jsonb_build_object('ok', false, 'error', 'already_claimed');
    end if;
  end if;

  if exists (
    select 1
    from public.public_profiles pp
    where pp.username_normalized = v_norm
      and pp.user_id is distinct from v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  insert into app_private.username_history (
    user_id,
    old_username,
    old_username_normalized,
    new_username,
    new_username_normalized,
    reason
  ) values (
    v_uid,
    v_row.username,
    v_row.username_normalized,
    v_raw,
    v_norm,
    coalesce(nullif(p_reason, ''), case when p_is_change then 'self_service_change' else 'self_service_claim' end)
  );

  insert into public.public_profiles (
    user_id,
    username,
    username_normalized,
    username_changed_at,
    username_change_required
  ) values (
    v_uid,
    v_raw,
    v_norm,
    case when p_is_change then timezone('utc', now()) else null end,
    false
  )
  on conflict (user_id) do update
  set
    username = excluded.username,
    username_normalized = excluded.username_normalized,
    username_changed_at = case
      when p_is_change then timezone('utc', now())
      when public.public_profiles.username_change_required then null
      else public.public_profiles.username_changed_at
    end,
    username_change_required = false,
    updated_at = timezone('utc', now())
  returning * into v_row;

  v_next := case
    when v_row.username_changed_at is null then null
    else v_row.username_changed_at + interval '30 days'
  end;

  return jsonb_build_object(
    'ok', true,
    'username', v_row.username,
    'username_normalized', v_row.username_normalized,
    'next_change_at', v_next,
    'username_change_required', v_row.username_change_required
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
end;
$$;

create or replace function public.claim_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  return app_private.apply_username(auth.uid(), p_username, false, 'self_service_claim');
end;
$$;

create or replace function public.change_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  return app_private.apply_username(auth.uid(), p_username, true, 'self_service_change');
end;
$$;

create or replace function public.check_username_available(p_username text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_err text;
  v_norm text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'available', false, 'error', 'not_authenticated');
  end if;

  v_err := app_private.validate_username_candidate(p_username);
  if v_err is not null then
    return jsonb_build_object('ok', true, 'available', false, 'error', 'unavailable');
  end if;

  v_norm := app_private.normalize_username(p_username);
  if exists (
    select 1
    from public.public_profiles pp
    where pp.username_normalized = v_norm
      and pp.user_id is distinct from auth.uid()
  ) then
    return jsonb_build_object('ok', true, 'available', false, 'error', 'unavailable');
  end if;

  return jsonb_build_object('ok', true, 'available', true);
end;
$$;

create or replace function public.get_my_account()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.public_profiles%rowtype;
  v_settings public.user_settings%rowtype;
  v_next timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Ensure settings row exists for legacy users.
  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select * into v_profile from public.public_profiles where user_id = v_uid;
  select * into v_settings from public.user_settings where user_id = v_uid;

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
      v_profile.username is not null
      and not coalesce(v_profile.username_change_required, false)
      and (
        v_profile.username_changed_at is null
        or v_profile.username_changed_at <= (timezone('utc', now()) - interval '30 days')
      )
    ),
    'reader_taste', v_settings.reader_taste,
    'leaderboard_visible', coalesce(v_settings.leaderboard_visible, false)
  );
end;
$$;

create or replace function public.update_my_settings(
  p_reader_taste text default null,
  p_leaderboard_visible boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.user_settings%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_reader_taste is not null
     and p_reader_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;

  if coalesce(p_leaderboard_visible, false) and not exists (
    select 1
    from public.public_profiles pp
    where pp.user_id = v_uid
      and pp.username is not null
      and not pp.username_change_required
  ) then
    return jsonb_build_object('ok', false, 'error', 'username_required');
  end if;

  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  update public.user_settings us
  set
    reader_taste = coalesce(p_reader_taste, us.reader_taste),
    leaderboard_visible = coalesce(p_leaderboard_visible, us.leaderboard_visible),
    updated_at = timezone('utc', now())
  where us.user_id = v_uid
  returning * into v_settings;

  return jsonb_build_object(
    'ok', true,
    'reader_taste', v_settings.reader_taste,
    'leaderboard_visible', v_settings.leaderboard_visible
  );
end;
$$;

revoke all on function app_private.fold_username_confusables(text) from public, anon, authenticated;
revoke all on function app_private.normalize_username(text) from public, anon, authenticated;
revoke all on function app_private.validate_username_candidate(text) from public, anon, authenticated;
revoke all on function app_private.apply_username(uuid, text, boolean, text) from public, anon, authenticated;

revoke all on function public.claim_username(text) from public;
revoke all on function public.claim_username(text) from anon;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.claim_username(text) to service_role;

revoke all on function public.change_username(text) from public;
revoke all on function public.change_username(text) from anon;
grant execute on function public.change_username(text) to authenticated;
grant execute on function public.change_username(text) to service_role;

revoke all on function public.check_username_available(text) from public;
revoke all on function public.check_username_available(text) from anon;
grant execute on function public.check_username_available(text) to authenticated;
grant execute on function public.check_username_available(text) to service_role;

revoke all on function public.get_my_account() from public;
revoke all on function public.get_my_account() from anon;
grant execute on function public.get_my_account() to authenticated;
grant execute on function public.get_my_account() to service_role;

revoke all on function public.update_my_settings(text, boolean) from public;
revoke all on function public.update_my_settings(text, boolean) from anon;
grant execute on function public.update_my_settings(text, boolean) to authenticated;
grant execute on function public.update_my_settings(text, boolean) to service_role;

-- Signup: profile + settings (no public username until claimed)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.claim_username(text) is
  'SECURITY DEFINER: first username claim (or forced replacement). Does not start the 30-day change cooldown.';
comment on function public.change_username(text) is
  'SECURITY DEFINER: self-service username change, once per rolling 30 days after a prior change.';
comment on function public.get_my_account() is
  'SECURITY DEFINER: own profile + settings snapshot for onboarding/settings UI.';
