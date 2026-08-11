-- Public news comments with authenticated posting and audited staff moderation.

alter table app_private.account_restrictions
  drop constraint if exists account_restrictions_kind_check;

alter table app_private.account_restrictions
  add constraint account_restrictions_kind_check check (
    kind = any (array[
      'cloud_ban'::text,
      'leaderboard_exclusion'::text,
      'force_username_change'::text,
      'comment_ban'::text
    ])
  );

create table if not exists public.site_update_comments (
  id uuid primary key default gen_random_uuid(),
  site_update_id uuid not null references public.site_updates (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  status text not null default 'visible',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  removal_reason text,
  removed_by_author boolean not null default false,
  constraint site_update_comments_body_len check (
    char_length(trim(body)) between 1 and 1000
  ),
  constraint site_update_comments_status check (
    status = any (array['visible'::text, 'removed'::text])
  ),
  constraint site_update_comments_removal_reason_len check (
    removal_reason is null
    or char_length(trim(removal_reason)) between 3 and 500
  ),
  constraint site_update_comments_removal_shape check (
    (status = 'visible'
      and removed_at is null
      and removed_by is null
      and removal_reason is null
      and removed_by_author = false)
    or
    (status = 'removed' and removed_at is not null)
  )
);

create index if not exists site_update_comments_public_idx
  on public.site_update_comments (site_update_id, created_at desc, id)
  where status = 'visible';

create index if not exists site_update_comments_moderation_idx
  on public.site_update_comments (created_at desc, id);

create index if not exists site_update_comments_author_idx
  on public.site_update_comments (author_id, created_at desc);

alter table public.site_update_comments enable row level security;
revoke all on table public.site_update_comments from public, anon, authenticated;
grant all on table public.site_update_comments to service_role;

comment on table public.site_update_comments is
  'RPC-only comments on published News posts. Removed rows are retained for moderation audit.';

create or replace function app_private.is_comment_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  select app_private.has_active_restriction(p_user_id, 'comment_ban')
      or app_private.is_cloud_banned(p_user_id);
$$;

create or replace function app_private.site_update_comment_to_json(
  p_row public.site_update_comments,
  p_include_private boolean default false,
  p_viewer_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', p_row.id,
      'body', p_row.body,
      'status', p_row.status,
      'created_at', p_row.created_at,
      'updated_at', p_row.updated_at,
      'username', pp.username,
      'avatar_id', coalesce(uap.equipped_item_id, 'avatar_default_female'),
      'stage_id', coalesce(uap.equipped_stage_id, 'stage_blossom_courtyard'),
      'is_mine', p_viewer_id is not null and p_viewer_id = p_row.author_id,
      'author_id', case when p_include_private then p_row.author_id else null end,
      'removed_at', case when p_include_private then p_row.removed_at else null end,
      'removal_reason', case when p_include_private then p_row.removal_reason else null end,
      'removed_by_author',
        case when p_include_private then p_row.removed_by_author else null end
    )
  )
  from public.public_profiles pp
  left join public.user_avatar_profiles uap on uap.user_id = p_row.author_id
  where pp.user_id = p_row.author_id;
$$;

create or replace function public.get_site_update_comments(
  p_slug text,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_update_id uuid;
  v_total integer;
begin
  select s.id into v_update_id
  from public.site_updates s
  where s.slug = v_slug and s.published = true;

  if v_update_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*)::integer into v_total
  from public.site_update_comments c
  where c.site_update_id = v_update_id and c.status = 'visible';

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'comments', coalesce((
      select jsonb_agg(q.obj order by q.created_at asc, q.id asc)
      from (
        select
          app_private.site_update_comment_to_json(c, false, auth.uid()) as obj,
          c.created_at,
          c.id
        from public.site_update_comments c
        where c.site_update_id = v_update_id
          and c.status = 'visible'
        order by c.created_at asc, c.id asc
        limit v_limit offset v_offset
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.post_site_update_comment(
  p_slug text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_update_id uuid;
  v_row public.site_update_comments%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if char_length(v_body) < 1 then
    return jsonb_build_object('ok', false, 'error', 'body_required');
  end if;
  if char_length(v_body) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'body_too_long');
  end if;
  if app_private.is_comment_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'comment_banned');
  end if;
  if not app_private.can_appear_publicly(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'public_profile_required');
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, 'post_site_update_comment', 5, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select s.id into v_update_id
  from public.site_updates s
  where s.slug = nullif(trim(coalesce(p_slug, '')), '')
    and s.published = true;
  if v_update_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.site_update_comments (site_update_id, author_id, body)
  values (v_update_id, v_uid, v_body)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'comment', app_private.site_update_comment_to_json(v_row, false, v_uid)
  );
end;
$$;

create or replace function public.delete_my_site_update_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.site_update_comments%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.site_update_comments c
  set
    status = 'removed',
    removed_at = timezone('utc', now()),
    removed_by = v_uid,
    removal_reason = 'removed by author',
    removed_by_author = true,
    updated_at = timezone('utc', now())
  where c.id = p_comment_id
    and c.author_id = v_uid
    and c.status = 'visible'
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

create or replace function public.moderation_list_site_update_comments(
  p_actor_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_post_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_total integer;
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  if v_status is not null and v_status not in ('visible', 'removed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select count(*)::integer into v_total
  from public.site_update_comments c
  join public.site_updates s on s.id = c.site_update_id
  where (v_status is null or c.status = v_status)
    and (p_post_slug is null or s.slug = p_post_slug);

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'comments', coalesce((
      select jsonb_agg(q.obj order by q.created_at desc, q.id desc)
      from (
        select
          app_private.site_update_comment_to_json(c, true, p_actor_id)
            || jsonb_build_object(
              'post_title', s.title,
              'post_slug', s.slug,
              'post_id', s.id
            ) as obj,
          c.created_at,
          c.id
        from public.site_update_comments c
        join public.site_updates s on s.id = c.site_update_id
        where (v_status is null or c.status = v_status)
          and (p_post_slug is null or s.slug = p_post_slug)
        order by c.created_at desc, c.id desc
        limit v_limit offset v_offset
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.moderation_set_site_update_comment_status(
  p_actor_id uuid,
  p_comment_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_row public.site_update_comments%rowtype;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, false);
  if p_status not in ('visible', 'removed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_row from public.site_update_comments where id = p_comment_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app_private.assert_can_target(p_actor_id, v_actor_role, v_row.author_id);

  update public.site_update_comments c
  set
    status = p_status,
    removed_at = case when p_status = 'removed' then timezone('utc', now()) else null end,
    removed_by = case when p_status = 'removed' then p_actor_id else null end,
    removal_reason = case when p_status = 'removed' then v_reason else null end,
    removed_by_author = false,
    updated_at = timezone('utc', now())
  where c.id = p_comment_id
  returning * into v_row;

  perform app_private.audit_moderation(
    p_actor_id,
    v_row.author_id,
    case when p_status = 'removed' then 'remove_news_comment' else 'restore_news_comment' end,
    v_reason,
    jsonb_build_object('comment_id', v_row.id, 'site_update_id', v_row.site_update_id)
  );

  return jsonb_build_object(
    'ok', true,
    'comment', app_private.site_update_comment_to_json(v_row, true, p_actor_id)
  );
end;
$$;

create or replace function public.moderation_issue_comment_ban(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_ends_at timestamptz,
  p_permanent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_actor_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_ends timestamptz;
  v_id bigint;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, false);
  perform app_private.assert_can_target(p_actor_id, v_actor_role, p_target_user_id);
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if coalesce(p_permanent, false) then
    if v_actor_role <> 'owner' then
      return jsonb_build_object('ok', false, 'error', 'owner_required');
    end if;
    v_ends := null;
  else
    if p_ends_at is null or p_ends_at <= timezone('utc', now()) then
      return jsonb_build_object('ok', false, 'error', 'expiry_required');
    end if;
    if v_actor_role = 'moderator'
       and p_ends_at > timezone('utc', now()) + interval '30 days' then
      return jsonb_build_object('ok', false, 'error', 'expiry_too_long');
    end if;
    v_ends := p_ends_at;
  end if;

  update app_private.account_restrictions
  set revoked_at = timezone('utc', now()), revoked_by = p_actor_id
  where user_id = p_target_user_id and kind = 'comment_ban' and revoked_at is null;

  insert into app_private.account_restrictions (
    user_id, kind, reason, ends_at, created_by
  ) values (
    p_target_user_id, 'comment_ban', v_reason, v_ends, p_actor_id
  ) returning id into v_id;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'issue_comment_ban', v_reason,
    jsonb_build_object('restriction_id', v_id, 'ends_at', v_ends, 'permanent', coalesce(p_permanent, false))
  );
  return jsonb_build_object('ok', true, 'restriction_id', v_id, 'ends_at', v_ends);
end;
$$;

create or replace function public.moderation_revoke_comment_ban(
  p_actor_id uuid,
  p_target_user_id uuid,
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
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if v_actor_role = 'moderator' and exists (
    select 1 from app_private.account_restrictions r
    where r.user_id = p_target_user_id
      and r.kind = 'comment_ban'
      and r.revoked_at is null
      and r.ends_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  update app_private.account_restrictions
  set revoked_at = timezone('utc', now()), revoked_by = p_actor_id
  where user_id = p_target_user_id and kind = 'comment_ban' and revoked_at is null;
  get diagnostics v_count = row_count;

  perform app_private.audit_moderation(
    p_actor_id, p_target_user_id, 'revoke_comment_ban', v_reason,
    jsonb_build_object('revoked_count', v_count)
  );
  return jsonb_build_object('ok', true, 'revoked_count', v_count);
end;
$$;

revoke all on function app_private.is_comment_banned(uuid)
  from public, anon, authenticated;
revoke all on function app_private.site_update_comment_to_json(public.site_update_comments, boolean, uuid)
  from public, anon, authenticated;
grant execute on function app_private.is_comment_banned(uuid)
  to postgres, service_role;
grant execute on function app_private.site_update_comment_to_json(public.site_update_comments, boolean, uuid)
  to postgres, service_role;

revoke all on function public.get_site_update_comments(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.post_site_update_comment(text, text)
  from public, anon, authenticated;
revoke all on function public.delete_my_site_update_comment(uuid)
  from public, anon, authenticated;
revoke all on function public.moderation_list_site_update_comments(uuid, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.moderation_issue_comment_ban(uuid, uuid, text, timestamptz, boolean)
  from public, anon, authenticated;
revoke all on function public.moderation_revoke_comment_ban(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_site_update_comments(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.post_site_update_comment(text, text)
  to authenticated, service_role;
grant execute on function public.delete_my_site_update_comment(uuid)
  to authenticated, service_role;
grant execute on function public.moderation_list_site_update_comments(uuid, text, integer, integer, text)
  to service_role;
grant execute on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  to service_role;
grant execute on function public.moderation_issue_comment_ban(uuid, uuid, text, timestamptz, boolean)
  to service_role;
grant execute on function public.moderation_revoke_comment_ban(uuid, uuid, text)
  to service_role;
