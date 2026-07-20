-- Roles, restrictions, blocked identities, moderation audit, reports, appeals.
-- Runs after identity_settings. app_private stays off the Data API.
-- Authorization always rechecks live private tables — never user_metadata.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- HMAC secret (server-only; used for blocked identity digests)
-- ---------------------------------------------------------------------------

create table if not exists app_private.identity_hmac_secret (
  id integer primary key default 1 check (id = 1),
  secret bytea not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table app_private.identity_hmac_secret enable row level security;
revoke all on table app_private.identity_hmac_secret from public, anon, authenticated;
grant all on table app_private.identity_hmac_secret to postgres, service_role;

insert into app_private.identity_hmac_secret (id, secret)
values (1, extensions.gen_random_bytes(32))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table if not exists app_private.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role = any (array['owner'::text, 'moderator'::text])),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, role)
);

comment on table app_private.user_roles is
  'Private RBAC. Bootstrap first owner via documented SQL only; no browser path.';

create index if not exists user_roles_role_idx on app_private.user_roles (role);

alter table app_private.user_roles enable row level security;
revoke all on table app_private.user_roles from public, anon, authenticated;
grant all on table app_private.user_roles to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Account restrictions
-- ---------------------------------------------------------------------------

create table if not exists app_private.account_restrictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind = any (array[
      'cloud_ban'::text,
      'leaderboard_exclusion'::text,
      'force_username_change'::text
    ])
  ),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  starts_at timestamptz not null default timezone('utc', now()),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint account_restrictions_ends_after_start check (
    ends_at is null or ends_at > starts_at
  )
);

comment on table app_private.account_restrictions is
  'Active when revoked_at is null and (ends_at is null or ends_at > now()). ends_at null = permanent.';

create index if not exists account_restrictions_user_kind_idx
  on app_private.account_restrictions (user_id, kind)
  where revoked_at is null;

create index if not exists account_restrictions_active_ends_idx
  on app_private.account_restrictions (ends_at)
  where revoked_at is null;

alter table app_private.account_restrictions enable row level security;
revoke all on table app_private.account_restrictions from public, anon, authenticated;
grant all on table app_private.account_restrictions to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Blocked identities (HMAC digests only — no plaintext)
-- ---------------------------------------------------------------------------

create table if not exists app_private.blocked_identities (
  id bigint generated always as identity primary key,
  kind text not null check (kind = any (array['email'::text, 'provider_subject'::text])),
  digest bytea not null,
  provider text,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocked_identities_provider_subject check (
    (kind = 'email' and provider is null)
    or (kind = 'provider_subject' and provider is not null and char_length(provider) between 1 and 64)
  )
);

create unique index if not exists blocked_identities_kind_digest_uidx
  on app_private.blocked_identities (kind, digest);

create unique index if not exists blocked_identities_provider_digest_uidx
  on app_private.blocked_identities (provider, digest)
  where kind = 'provider_subject';

alter table app_private.blocked_identities enable row level security;
revoke all on table app_private.blocked_identities from public, anon, authenticated;
grant all on table app_private.blocked_identities to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Append-only moderation audit
-- ---------------------------------------------------------------------------

create table if not exists app_private.moderation_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 64),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists moderation_actions_created_idx
  on app_private.moderation_actions (created_at desc);

create index if not exists moderation_actions_target_idx
  on app_private.moderation_actions (target_user_id, created_at desc);

alter table app_private.moderation_actions enable row level security;
revoke all on table app_private.moderation_actions from public, anon, authenticated;
grant insert, select on table app_private.moderation_actions to postgres, service_role;
-- No UPDATE/DELETE grants for append-only semantics (postgres can still truncate in emergencies).

-- ---------------------------------------------------------------------------
-- Reports & appeals (private; submitted via RPCs)
-- ---------------------------------------------------------------------------

create table if not exists app_private.user_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid references auth.users (id) on delete set null,
  target_username_normalized text,
  reason_code text not null check (
    reason_code = any (array[
      'harassment'::text,
      'impersonation'::text,
      'inappropriate_username'::text,
      'cheating'::text,
      'spam'::text,
      'other'::text
    ])
  ),
  details text not null check (char_length(trim(details)) between 3 and 1000),
  status text not null default 'open'
    check (status = any (array['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_reports_status_created_idx
  on app_private.user_reports (status, created_at desc);

create index if not exists user_reports_reporter_created_idx
  on app_private.user_reports (reporter_id, created_at desc);

-- One open report per reporter→target within 24h (when target known).
create unique index if not exists user_reports_open_target_daily_uidx
  on app_private.user_reports (
    reporter_id,
    target_user_id,
    ((timezone('utc', created_at))::date)
  )
  where status in ('open', 'reviewing') and target_user_id is not null;

alter table app_private.user_reports enable row level security;
revoke all on table app_private.user_reports from public, anon, authenticated;
grant all on table app_private.user_reports to postgres, service_role;

create table if not exists app_private.moderation_appeals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind = any (array['cloud_ban'::text, 'leaderboard_exclusion'::text, 'force_username_change'::text, 'other'::text])
  ),
  details text not null check (char_length(trim(details)) between 3 and 1000),
  status text not null default 'open'
    check (status = any (array['open'::text, 'reviewing'::text, 'accepted'::text, 'denied'::text])),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists moderation_appeals_status_created_idx
  on app_private.moderation_appeals (status, created_at desc);

create index if not exists moderation_appeals_user_created_idx
  on app_private.moderation_appeals (user_id, created_at desc);

create unique index if not exists moderation_appeals_open_kind_uidx
  on app_private.moderation_appeals (user_id, kind)
  where status in ('open', 'reviewing');

alter table app_private.moderation_appeals enable row level security;
revoke all on table app_private.moderation_appeals from public, anon, authenticated;
grant all on table app_private.moderation_appeals to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.has_role(p_user_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select exists (
    select 1
    from app_private.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = p_role
  );
$$;

create or replace function app_private.is_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.has_role(p_user_id, 'owner');
$$;

create or replace function app_private.is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select exists (
    select 1
    from app_private.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('owner', 'moderator')
  );
$$;

create or replace function app_private.staff_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select case
    when app_private.is_owner(p_user_id) then 'owner'
    when app_private.has_role(p_user_id, 'moderator') then 'moderator'
    else null
  end;
$$;

create or replace function app_private.has_active_restriction(p_user_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select exists (
    select 1
    from app_private.account_restrictions r
    where r.user_id = p_user_id
      and r.kind = p_kind
      and r.revoked_at is null
      and (r.ends_at is null or r.ends_at > timezone('utc', now()))
  );
$$;

create or replace function app_private.is_cloud_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.has_active_restriction(p_user_id, 'cloud_ban');
$$;

-- Reusable for future leaderboard RPCs.
create or replace function app_private.is_leaderboard_excluded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.has_active_restriction(p_user_id, 'leaderboard_exclusion')
      or app_private.is_cloud_banned(p_user_id);
$$;

create or replace function app_private.can_appear_publicly(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select not app_private.is_cloud_banned(p_user_id)
     and not app_private.has_active_restriction(p_user_id, 'force_username_change')
     and exists (
       select 1
       from public.public_profiles pp
       where pp.user_id = p_user_id
         and pp.username is not null
         and not pp.username_change_required
     );
$$;

create or replace function app_private.identity_digest(p_normalized text)
returns bytea
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'extensions'
as $$
declare
  v_secret bytea;
begin
  select s.secret into v_secret from app_private.identity_hmac_secret s where s.id = 1;
  if v_secret is null then
    raise exception 'identity hmac secret missing';
  end if;
  return extensions.hmac(convert_to(p_normalized, 'UTF8'), v_secret, 'sha256');
end;
$$;

create or replace function app_private.normalize_email(p_email text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

create or replace function app_private.audit_moderation(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  insert into app_private.moderation_actions (
    actor_id, target_user_id, action, reason, payload
  ) values (
    p_actor_id,
    p_target_user_id,
    p_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function app_private.assert_moderation_actor(
  p_actor_id uuid,
  p_require_owner boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_role := app_private.staff_role(p_actor_id);
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_require_owner and v_role <> 'owner' then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function app_private.assert_can_target(
  p_actor_id uuid,
  p_actor_role text,
  p_target_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  if p_target_user_id is null then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_target_user_id = p_actor_id then
    raise exception 'cannot_target_self' using errcode = '22023';
  end if;
  -- Moderators may not act on privileged users (owner or moderator).
  if p_actor_role = 'moderator' and app_private.is_staff(p_target_user_id) then
    raise exception 'cannot_target_privileged' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation mutations (service_role / edge only)
-- ---------------------------------------------------------------------------

create or replace function app_private.grant_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, true);
  perform app_private.assert_can_target(p_actor_id, v_actor_role, p_target_user_id);
  if p_role not in ('owner', 'moderator') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  -- After bootstrap, only an existing owner may grant owner.
  if p_role = 'owner' and not app_private.is_owner(p_actor_id) then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  insert into app_private.user_roles (user_id, role, granted_by)
  values (p_target_user_id, p_role, p_actor_id)
  on conflict (user_id, role) do nothing;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'grant_role', v_reason,
    jsonb_build_object('role', p_role)
  );
  return jsonb_build_object('ok', true, 'role', p_role);
end;
$$;

create or replace function app_private.revoke_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_owner_count integer;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, true);
  perform app_private.assert_can_target(p_actor_id, v_actor_role, p_target_user_id);
  if p_role not in ('owner', 'moderator') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  if p_role = 'owner' then
    select count(*) into v_owner_count from app_private.user_roles where role = 'owner';
    if v_owner_count <= 1 and app_private.has_role(p_target_user_id, 'owner') then
      return jsonb_build_object('ok', false, 'error', 'last_owner');
    end if;
  end if;

  delete from app_private.user_roles
  where user_id = p_target_user_id and role = p_role;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'revoke_role', v_reason,
    jsonb_build_object('role', p_role)
  );
  return jsonb_build_object('ok', true, 'role', p_role);
end;
$$;

create or replace function app_private.issue_restriction(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_kind text,
  p_reason text,
  p_ends_at timestamptz,
  p_permanent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_ends timestamptz;
  v_id bigint;
  v_old_username text;
  v_old_norm text;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, false);
  perform app_private.assert_can_target(p_actor_id, v_actor_role, p_target_user_id);

  if p_kind not in ('cloud_ban', 'leaderboard_exclusion', 'force_username_change') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  if coalesce(p_permanent, false) then
    if v_actor_role <> 'owner' then
      return jsonb_build_object('ok', false, 'error', 'owner_required');
    end if;
    if p_kind = 'force_username_change' then
      return jsonb_build_object('ok', false, 'error', 'invalid_kind');
    end if;
    v_ends := null;
  else
    if p_kind = 'force_username_change' then
      v_ends := null; -- cleared when user claims a new name
    else
      if p_ends_at is null or p_ends_at <= timezone('utc', now()) then
        return jsonb_build_object('ok', false, 'error', 'expiry_required');
      end if;
      -- Moderators: max 30 days temporary.
      if v_actor_role = 'moderator'
         and p_ends_at > timezone('utc', now()) + interval '30 days' then
        return jsonb_build_object('ok', false, 'error', 'expiry_too_long');
      end if;
      v_ends := p_ends_at;
    end if;
  end if;

  -- Revoke prior active rows of same kind.
  update app_private.account_restrictions
  set revoked_at = timezone('utc', now()), revoked_by = p_actor_id
  where user_id = p_target_user_id
    and kind = p_kind
    and revoked_at is null;

  insert into app_private.account_restrictions (
    user_id, kind, reason, ends_at, created_by
  ) values (
    p_target_user_id, p_kind, v_reason, v_ends, p_actor_id
  )
  returning id into v_id;

  if p_kind = 'force_username_change' then
    select pp.username, pp.username_normalized
    into v_old_username, v_old_norm
    from public.public_profiles pp
    where pp.user_id = p_target_user_id;

    insert into app_private.username_history (
      user_id, old_username, old_username_normalized,
      new_username, new_username_normalized, reason
    ) values (
      p_target_user_id, v_old_username, v_old_norm, null, null, 'force_username_change'
    );

    insert into public.public_profiles (
      user_id, username, username_normalized, username_change_required
    ) values (
      p_target_user_id, null, null, true
    )
    on conflict (user_id) do update
    set
      username = null,
      username_normalized = null,
      username_change_required = true,
      updated_at = timezone('utc', now());
  end if;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'issue_' || p_kind, v_reason,
    jsonb_build_object(
      'restriction_id', v_id,
      'ends_at', v_ends,
      'permanent', coalesce(p_permanent, false)
    )
  );

  return jsonb_build_object('ok', true, 'restriction_id', v_id, 'ends_at', v_ends);
end;
$$;

create or replace function app_private.revoke_restriction(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_kind text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_count integer;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, false);
  perform app_private.assert_can_target(p_actor_id, v_actor_role, p_target_user_id);
  if p_kind not in ('cloud_ban', 'leaderboard_exclusion', 'force_username_change') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  -- Permanent restrictions (ends_at null) may only be revoked by owner.
  if v_actor_role = 'moderator' and exists (
    select 1 from app_private.account_restrictions r
    where r.user_id = p_target_user_id
      and r.kind = p_kind
      and r.revoked_at is null
      and r.ends_at is null
      and r.kind <> 'force_username_change'
  ) then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  update app_private.account_restrictions
  set revoked_at = timezone('utc', now()), revoked_by = p_actor_id
  where user_id = p_target_user_id
    and kind = p_kind
    and revoked_at is null;

  get diagnostics v_count = row_count;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'revoke_' || p_kind, v_reason,
    jsonb_build_object('revoked_count', v_count)
  );
  return jsonb_build_object('ok', true, 'revoked_count', v_count);
end;
$$;

create or replace function app_private.block_identity(
  p_actor_id uuid,
  p_kind text,
  p_value text,
  p_provider text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_norm text;
  v_digest bytea;
  v_id bigint;
begin
  -- Permanent identity blocks are owner-only.
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, true);
  if char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  if p_kind = 'email' then
    v_norm := app_private.normalize_email(p_value);
    if v_norm is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_identity');
    end if;
    v_digest := app_private.identity_digest('email:' || v_norm);
    insert into app_private.blocked_identities (kind, digest, provider, reason, created_by)
    values ('email', v_digest, null, v_reason, p_actor_id)
    on conflict (kind, digest) do update
      set reason = excluded.reason
    returning id into v_id;
  elsif p_kind = 'provider_subject' then
    if p_provider is null or trim(p_provider) = '' or p_value is null or trim(p_value) = '' then
      return jsonb_build_object('ok', false, 'error', 'invalid_identity');
    end if;
    v_norm := lower(trim(p_provider)) || ':' || trim(p_value);
    v_digest := app_private.identity_digest('provider:' || v_norm);
    insert into app_private.blocked_identities (kind, digest, provider, reason, created_by)
    values ('provider_subject', v_digest, lower(trim(p_provider)), v_reason, p_actor_id)
    on conflict (kind, digest) do update
      set reason = excluded.reason
    returning id into v_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  perform app_private.audit_moderation(
    p_actor_id, null, 'block_identity', v_reason,
    jsonb_build_object('kind', p_kind, 'blocked_id', v_id, 'provider', p_provider)
  );
  return jsonb_build_object('ok', true, 'blocked_id', v_id);
end;
$$;

create or replace function app_private.find_user_by_username(
  p_actor_id uuid,
  p_username text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_norm text := lower(trim(coalesce(p_username, '')));
  v_row record;
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select pp.user_id, pp.username, pp.username_normalized, pp.username_change_required
  into v_row
  from public.public_profiles pp
  where pp.username_normalized = v_norm;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'username', v_row.username,
    'username_normalized', v_row.username_normalized,
    'username_change_required', v_row.username_change_required,
    'staff_role', app_private.staff_role(v_row.user_id),
    'cloud_banned', app_private.is_cloud_banned(v_row.user_id),
    'leaderboard_excluded', app_private.is_leaderboard_excluded(v_row.user_id),
    'force_username_change', app_private.has_active_restriction(v_row.user_id, 'force_username_change')
  );
end;
$$;

create or replace function app_private.list_reports(p_actor_id uuid, p_status text, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc)
    from (
      select r.id, r.reporter_id, r.target_user_id, r.target_username_normalized,
             r.reason_code, r.details, r.status, r.created_at
      from app_private.user_reports r
      where (p_status is null or r.status = p_status)
      order by r.created_at desc
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function app_private.list_appeals(p_actor_id uuid, p_status text, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc)
    from (
      select a.id, a.user_id, a.kind, a.details, a.status, a.created_at
      from app_private.moderation_appeals a
      where (p_status is null or a.status = p_status)
      order by a.created_at desc
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function app_private.list_audit(p_actor_id uuid, p_target_user_id uuid, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc)
    from (
      select m.id, m.actor_id, m.target_user_id, m.action, m.reason, m.payload, m.created_at
      from app_private.moderation_actions m
      where (p_target_user_id is null or m.target_user_id = p_target_user_id)
      order by m.created_at desc
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function app_private.set_report_status(
  p_actor_id uuid,
  p_report_id bigint,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  update app_private.user_reports
  set status = p_status, updated_at = timezone('utc', now())
  where id = p_report_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app_private.audit_moderation(
    p_actor_id, null, 'set_report_status', coalesce(p_reason, ''),
    jsonb_build_object('report_id', p_report_id, 'status', p_status)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app_private.set_appeal_status(
  p_actor_id uuid,
  p_appeal_id bigint,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  if p_status not in ('open', 'reviewing', 'accepted', 'denied') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  update app_private.moderation_appeals
  set status = p_status, updated_at = timezone('utc', now())
  where id = p_appeal_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app_private.audit_moderation(
    p_actor_id, null, 'set_appeal_status', coalesce(p_reason, ''),
    jsonb_build_object('appeal_id', p_appeal_id, 'status', p_status)
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Before User Created hook (enable in Auth Hooks dashboard / config)
-- ---------------------------------------------------------------------------

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_email text;
  v_norm text;
  v_digest bytea;
  v_provider text;
  v_identities jsonb;
  v_identity jsonb;
  v_subject text;
begin
  v_email := event->'user'->>'email';
  v_norm := app_private.normalize_email(v_email);
  if v_norm is not null then
    v_digest := app_private.identity_digest('email:' || v_norm);
    if exists (
      select 1 from app_private.blocked_identities b
      where b.kind = 'email' and b.digest = v_digest
    ) then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'Unable to create account.',
          'http_code', 403
        )
      );
    end if;
  end if;

  v_provider := event->'user'->'app_metadata'->>'provider';
  v_identities := event->'user'->'identities';
  if v_identities is not null and jsonb_typeof(v_identities) = 'array' then
    for v_identity in select * from jsonb_array_elements(v_identities)
    loop
      v_subject := coalesce(v_identity->>'provider_id', v_identity->>'id', v_identity->>'sub');
      v_provider := coalesce(v_identity->>'provider', v_provider);
      if v_provider is not null and v_subject is not null then
        v_digest := app_private.identity_digest(
          'provider:' || lower(trim(v_provider)) || ':' || trim(v_subject)
        );
        if exists (
          select 1 from app_private.blocked_identities b
          where b.kind = 'provider_subject'
            and b.provider = lower(trim(v_provider))
            and b.digest = v_digest
        ) then
          return jsonb_build_object(
            'error', jsonb_build_object(
              'message', 'Unable to create account.',
              'http_code', 403
            )
          );
        end if;
      end if;
    end loop;
  end if;

  -- Do not retain IP from event.metadata.
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Clear force_username_change on successful claim / forced replacement
-- ---------------------------------------------------------------------------

create or replace function app_private.clear_force_username_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
begin
  update app_private.account_restrictions
  set revoked_at = timezone('utc', now()), revoked_by = p_user_id
  where user_id = p_user_id
    and kind = 'force_username_change'
    and revoked_at is null;
end;
$$;

-- Patch apply_username: after successful claim/change clearing required flag,
-- also clear force_username_change restriction. Recreate with ban checks on
-- self-service change (not claim when forced).

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
  v_forced boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Cloud ban blocks self-service username change; forced claim still allowed.
  select coalesce(pp.username_change_required, false) into v_forced
  from public.public_profiles pp
  where pp.user_id = v_uid;
  v_forced := coalesce(v_forced, false)
    or app_private.has_active_restriction(v_uid, 'force_username_change');

  if app_private.is_cloud_banned(v_uid) and p_is_change then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if app_private.is_cloud_banned(v_uid) and not p_is_change and not v_forced then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
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

  -- Forced rename replacement clears restriction and bypasses cooldown (changed_at left null).
  if not p_is_change then
    perform app_private.clear_force_username_change(v_uid);
  end if;

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

-- ---------------------------------------------------------------------------
-- Update public account RPCs for ban + role visibility
-- ---------------------------------------------------------------------------

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
    'leaderboard_visible', coalesce(v_settings.leaderboard_visible, false),
    'staff_role', v_role,
    'cloud_banned', v_banned,
    'leaderboard_excluded', app_private.is_leaderboard_excluded(v_uid),
    'can_appear_publicly', app_private.can_appear_publicly(v_uid)
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

-- ---------------------------------------------------------------------------
-- Report / appeal submission RPCs (authenticated; own-user derived)
-- ---------------------------------------------------------------------------

create or replace function public.submit_user_report(
  p_target_username text,
  p_reason_code text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_details text := trim(coalesce(p_details, ''));
  v_target_norm text := lower(trim(coalesce(p_target_username, '')));
  v_target_id uuid;
  v_id bigint;
  v_recent integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_reason_code not in (
    'harassment', 'impersonation', 'inappropriate_username', 'cheating', 'spam', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  if char_length(v_details) < 3 or char_length(v_details) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_details');
  end if;

  select count(*) into v_recent
  from app_private.user_reports r
  where r.reporter_id = v_uid
    and r.created_at > timezone('utc', now()) - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if v_target_norm <> '' then
    select pp.user_id into v_target_id
    from public.public_profiles pp
    where pp.username_normalized = v_target_norm;
    if v_target_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_target_id = v_uid then
      return jsonb_build_object('ok', false, 'error', 'cannot_target_self');
    end if;
  end if;

  begin
    insert into app_private.user_reports (
      reporter_id, target_user_id, target_username_normalized, reason_code, details
    ) values (
      v_uid, v_target_id, nullif(v_target_norm, ''), p_reason_code, v_details
    )
    returning id into v_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
  end;

  return jsonb_build_object('ok', true, 'report_id', v_id, 'status', 'open');
end;
$$;

create or replace function public.submit_moderation_appeal(
  p_kind text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_details text := trim(coalesce(p_details, ''));
  v_id bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_kind not in ('cloud_ban', 'leaderboard_exclusion', 'force_username_change', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if char_length(v_details) < 3 or char_length(v_details) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_details');
  end if;

  begin
    insert into app_private.moderation_appeals (user_id, kind, details)
    values (v_uid, p_kind, v_details)
    returning id into v_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
  end;

  return jsonb_build_object('ok', true, 'appeal_id', v_id, 'status', 'open');
end;
$$;

create or replace function public.get_my_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  return jsonb_build_object(
    'ok', true,
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reason_code', r.reason_code,
        'status', r.status,
        'created_at', r.created_at,
        'target_username_normalized', r.target_username_normalized
      ) order by r.created_at desc)
      from app_private.user_reports r
      where r.reporter_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_my_appeals()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  return jsonb_build_object(
    'ok', true,
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'kind', a.kind,
        'status', a.status,
        'created_at', a.created_at
      ) order by a.created_at desc)
      from app_private.moderation_appeals a
      where a.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.submit_user_report(text, text, text) from public;
revoke all on function public.submit_user_report(text, text, text) from anon;
grant execute on function public.submit_user_report(text, text, text) to authenticated;
grant execute on function public.submit_user_report(text, text, text) to service_role;

revoke all on function public.submit_moderation_appeal(text, text) from public;
revoke all on function public.submit_moderation_appeal(text, text) from anon;
grant execute on function public.submit_moderation_appeal(text, text) to authenticated;
grant execute on function public.submit_moderation_appeal(text, text) to service_role;

revoke all on function public.get_my_reports() from public;
revoke all on function public.get_my_reports() from anon;
grant execute on function public.get_my_reports() to authenticated;
grant execute on function public.get_my_reports() to service_role;

revoke all on function public.get_my_appeals() from public;
revoke all on function public.get_my_appeals() from anon;
grant execute on function public.get_my_appeals() to authenticated;
grant execute on function public.get_my_appeals() to service_role;

-- ---------------------------------------------------------------------------
-- complete_daily_mode: block cloud-banned writes
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

-- ---------------------------------------------------------------------------
-- RLS: cloud ban blocks writes; SELECT own preserved
-- ---------------------------------------------------------------------------

create or replace function app_private.not_cloud_banned()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select auth.uid() is not null
     and not app_private.is_cloud_banned(auth.uid());
$$;

-- Public wrapper so RLS policies do not require USAGE on app_private.
create or replace function public.not_cloud_banned()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.not_cloud_banned();
$$;

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id and public.not_cloud_banned())
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (auth.uid() = user_id and public.not_cloud_banned())
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists player_stats_insert_own on public.player_stats;
create policy player_stats_insert_own
  on public.player_stats for insert to authenticated
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists player_stats_update_own on public.player_stats;
create policy player_stats_update_own
  on public.player_stats for update to authenticated
  using (auth.uid() = user_id and public.not_cloud_banned())
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists day_progress_insert_own on public.day_progress;
create policy day_progress_insert_own
  on public.day_progress for insert to authenticated
  with check (auth.uid() = user_id and public.not_cloud_banned());

drop policy if exists day_progress_update_own on public.day_progress;
create policy day_progress_update_own
  on public.day_progress for update to authenticated
  using (auth.uid() = user_id and public.not_cloud_banned())
  with check (auth.uid() = user_id and public.not_cloud_banned());

-- ---------------------------------------------------------------------------
-- Least EXECUTE on private helpers / mutations
-- ---------------------------------------------------------------------------

revoke all on function app_private.has_role(uuid, text) from public, anon, authenticated;
revoke all on function app_private.is_owner(uuid) from public, anon, authenticated;
revoke all on function app_private.is_staff(uuid) from public, anon, authenticated;
revoke all on function app_private.staff_role(uuid) from public, anon, authenticated;
revoke all on function app_private.has_active_restriction(uuid, text) from public, anon, authenticated;
revoke all on function app_private.is_cloud_banned(uuid) from public, anon, authenticated;
revoke all on function app_private.is_leaderboard_excluded(uuid) from public, anon, authenticated;
revoke all on function app_private.can_appear_publicly(uuid) from public, anon, authenticated;
revoke all on function app_private.identity_digest(text) from public, anon, authenticated;
revoke all on function app_private.normalize_email(text) from public, anon, authenticated;
revoke all on function app_private.audit_moderation(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.assert_moderation_actor(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.assert_can_target(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.clear_force_username_change(uuid) from public, anon, authenticated;
revoke all on function app_private.not_cloud_banned() from public, anon, authenticated;

grant execute on function app_private.has_role(uuid, text) to postgres, service_role;
grant execute on function app_private.is_owner(uuid) to postgres, service_role;
grant execute on function app_private.is_staff(uuid) to postgres, service_role;
grant execute on function app_private.staff_role(uuid) to postgres, service_role;
grant execute on function app_private.has_active_restriction(uuid, text) to postgres, service_role;
grant execute on function app_private.is_cloud_banned(uuid) to postgres, service_role;
grant execute on function app_private.is_leaderboard_excluded(uuid) to postgres, service_role;
grant execute on function app_private.can_appear_publicly(uuid) to postgres, service_role;
grant execute on function app_private.identity_digest(text) to postgres, service_role;
grant execute on function app_private.normalize_email(text) to postgres, service_role;
grant execute on function app_private.audit_moderation(uuid, uuid, text, text, jsonb) to postgres, service_role;
grant execute on function app_private.assert_moderation_actor(uuid, boolean) to postgres, service_role;
grant execute on function app_private.assert_can_target(uuid, text, uuid) to postgres, service_role;
grant execute on function app_private.clear_force_username_change(uuid) to postgres, service_role;
grant execute on function app_private.not_cloud_banned() to postgres, service_role;

revoke all on function public.not_cloud_banned() from public;
revoke all on function public.not_cloud_banned() from anon;
grant execute on function public.not_cloud_banned() to authenticated;
grant execute on function public.not_cloud_banned() to service_role;

revoke all on function app_private.grant_role(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.revoke_role(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.issue_restriction(uuid, uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function app_private.revoke_restriction(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.block_identity(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function app_private.find_user_by_username(uuid, text) from public, anon, authenticated;
revoke all on function app_private.list_reports(uuid, text, integer) from public, anon, authenticated;
revoke all on function app_private.list_appeals(uuid, text, integer) from public, anon, authenticated;
revoke all on function app_private.list_audit(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function app_private.set_report_status(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function app_private.set_appeal_status(uuid, bigint, text, text) from public, anon, authenticated;

grant execute on function app_private.grant_role(uuid, uuid, text, text) to service_role;
grant execute on function app_private.revoke_role(uuid, uuid, text, text) to service_role;
grant execute on function app_private.issue_restriction(uuid, uuid, text, text, timestamptz, boolean) to service_role;
grant execute on function app_private.revoke_restriction(uuid, uuid, text, text) to service_role;
grant execute on function app_private.block_identity(uuid, text, text, text, text) to service_role;
grant execute on function app_private.find_user_by_username(uuid, text) to service_role;
grant execute on function app_private.list_reports(uuid, text, integer) to service_role;
grant execute on function app_private.list_appeals(uuid, text, integer) to service_role;
grant execute on function app_private.list_audit(uuid, uuid, integer) to service_role;
grant execute on function app_private.set_report_status(uuid, bigint, text, text) to service_role;
grant execute on function app_private.set_appeal_status(uuid, bigint, text, text) to service_role;

comment on function public.hook_before_user_created(jsonb) is
  'Auth Before User Created hook: rejects signup when email/provider digests match app_private.blocked_identities. Enable in Auth Hooks; does not store IPs.';

-- ---------------------------------------------------------------------------
-- Public service_role-only wrappers for Edge Function (app_private not in API)
-- ---------------------------------------------------------------------------

create or replace function public.moderation_find_user_by_username(
  p_actor_id uuid, p_username text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.find_user_by_username(p_actor_id, p_username); $$;

create or replace function public.moderation_list_reports(
  p_actor_id uuid, p_status text, p_limit integer
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.list_reports(p_actor_id, p_status, p_limit); $$;

create or replace function public.moderation_list_appeals(
  p_actor_id uuid, p_status text, p_limit integer
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.list_appeals(p_actor_id, p_status, p_limit); $$;

create or replace function public.moderation_list_audit(
  p_actor_id uuid, p_target_user_id uuid, p_limit integer
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.list_audit(p_actor_id, p_target_user_id, p_limit); $$;

create or replace function public.moderation_set_report_status(
  p_actor_id uuid, p_report_id bigint, p_status text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.set_report_status(p_actor_id, p_report_id, p_status, p_reason); $$;

create or replace function public.moderation_set_appeal_status(
  p_actor_id uuid, p_appeal_id bigint, p_status text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.set_appeal_status(p_actor_id, p_appeal_id, p_status, p_reason); $$;

create or replace function public.moderation_issue_restriction(
  p_actor_id uuid, p_target_user_id uuid, p_kind text, p_reason text,
  p_ends_at timestamptz, p_permanent boolean
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.issue_restriction(p_actor_id, p_target_user_id, p_kind, p_reason, p_ends_at, p_permanent); $$;

create or replace function public.moderation_revoke_restriction(
  p_actor_id uuid, p_target_user_id uuid, p_kind text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.revoke_restriction(p_actor_id, p_target_user_id, p_kind, p_reason); $$;

create or replace function public.moderation_grant_role(
  p_actor_id uuid, p_target_user_id uuid, p_role text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.grant_role(p_actor_id, p_target_user_id, p_role, p_reason); $$;

create or replace function public.moderation_revoke_role(
  p_actor_id uuid, p_target_user_id uuid, p_role text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.revoke_role(p_actor_id, p_target_user_id, p_role, p_reason); $$;

create or replace function public.moderation_block_identity(
  p_actor_id uuid, p_kind text, p_value text, p_provider text, p_reason text
) returns jsonb language sql security definer
set search_path to 'pg_catalog', 'app_private'
as $$ select app_private.block_identity(p_actor_id, p_kind, p_value, p_provider, p_reason); $$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'moderation_find_user_by_username(uuid, text)',
    'moderation_list_reports(uuid, text, integer)',
    'moderation_list_appeals(uuid, text, integer)',
    'moderation_list_audit(uuid, uuid, integer)',
    'moderation_set_report_status(uuid, bigint, text, text)',
    'moderation_set_appeal_status(uuid, bigint, text, text)',
    'moderation_issue_restriction(uuid, uuid, text, text, timestamptz, boolean)',
    'moderation_revoke_restriction(uuid, uuid, text, text)',
    'moderation_grant_role(uuid, uuid, text, text)',
    'moderation_revoke_role(uuid, uuid, text, text)',
    'moderation_block_identity(uuid, text, text, text, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
