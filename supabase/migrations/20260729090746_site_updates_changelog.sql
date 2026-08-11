-- Public site changelog ("Updates") with owner authoring via moderation RPCs.
-- Table is service_role-only; clients read through SECURITY DEFINER RPCs.

create table if not exists public.site_updates (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  body text not null,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint site_updates_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 120
  ),
  constraint site_updates_title_len check (
    char_length(trim(title)) between 1 and 200
  ),
  constraint site_updates_body_len check (
    char_length(trim(body)) between 1 and 20000
  )
);

create unique index if not exists site_updates_slug_uidx
  on public.site_updates (slug);

create index if not exists site_updates_published_at_idx
  on public.site_updates (published_at desc nulls last)
  where published = true;

alter table public.site_updates enable row level security;

revoke all on table public.site_updates from public, anon, authenticated;
grant all on table public.site_updates to service_role;

comment on table public.site_updates is
  'Owner-authored public changelog entries for /updates. No direct client table access.';

create or replace function app_private.slugify_site_update_title(p_title text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_slug text;
begin
  v_slug := lower(trim(both '-' from regexp_replace(
    lower(trim(coalesce(p_title, ''))),
    '[^a-z0-9]+',
    '-',
    'g'
  )));
  if v_slug is null or v_slug = '' then
    return 'update';
  end if;
  if char_length(v_slug) > 100 then
    v_slug := trim(both '-' from left(v_slug, 100));
  end if;
  if v_slug = '' then
    return 'update';
  end if;
  return v_slug;
end;
$$;

revoke all on function app_private.slugify_site_update_title(text)
  from public, anon, authenticated;
grant execute on function app_private.slugify_site_update_title(text)
  to postgres, service_role;

create or replace function app_private.allocate_site_update_slug(
  p_title text,
  p_preferred text default null,
  p_exclude_id uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 2;
begin
  if p_preferred is not null and length(trim(p_preferred)) > 0 then
    v_base := app_private.slugify_site_update_title(p_preferred);
  else
    v_base := app_private.slugify_site_update_title(p_title);
  end if;

  v_slug := v_base;
  while exists (
    select 1
    from public.site_updates su
    where su.slug = v_slug
      and (p_exclude_id is null or su.id is distinct from p_exclude_id)
  ) loop
    v_slug := v_base || '-' || v_n::text;
    v_n := v_n + 1;
    if v_n > 1000 then
      raise exception 'slug_exhausted' using errcode = '23505';
    end if;
  end loop;

  return v_slug;
end;
$$;

revoke all on function app_private.allocate_site_update_slug(text, text, uuid)
  from public, anon, authenticated;
grant execute on function app_private.allocate_site_update_slug(text, text, uuid)
  to postgres, service_role;

create or replace function app_private.site_update_to_json(p_row public.site_updates)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'slug', p_row.slug,
    'title', p_row.title,
    'body', p_row.body,
    'published', p_row.published,
    'published_at', p_row.published_at,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

revoke all on function app_private.site_update_to_json(public.site_updates)
  from public, anon, authenticated;
grant execute on function app_private.site_update_to_json(public.site_updates)
  to postgres, service_role;

create or replace function public.get_public_site_updates(
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return jsonb_build_object(
    'ok', true,
    'updates', coalesce(
      (
        select jsonb_agg(j.obj order by j.published_at desc nulls last, j.created_at desc)
        from (
          select
            app_private.site_update_to_json(s) as obj,
            s.published_at,
            s.created_at
          from public.site_updates s
          where s.published = true
          order by s.published_at desc nulls last, s.created_at desc
          limit v_limit
          offset v_offset
        ) j
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_public_site_update(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_row public.site_updates%rowtype;
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
begin
  if v_slug is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select *
  into v_row
  from public.site_updates s
  where s.slug = v_slug
    and s.published = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'update', app_private.site_update_to_json(v_row)
  );
end;
$$;

create or replace function public.moderation_list_site_updates(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'updates', coalesce(
      (
        select jsonb_agg(j.obj order by j.updated_at desc, j.created_at desc)
        from (
          select
            app_private.site_update_to_json(s) as obj,
            s.updated_at,
            s.created_at
          from public.site_updates s
          order by s.updated_at desc, s.created_at desc
          limit 200
        ) j
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.moderation_upsert_site_update(
  p_actor_id uuid,
  p_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_slug text default null,
  p_published boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_row public.site_updates%rowtype;
  v_title text;
  v_body text;
  v_slug text;
  v_published boolean;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_id is null then
    v_title := nullif(trim(coalesce(p_title, '')), '');
    v_body := nullif(trim(coalesce(p_body, '')), '');
    if v_title is null then
      raise exception 'title_required' using errcode = '22023';
    end if;
    if v_body is null then
      raise exception 'body_required' using errcode = '22023';
    end if;
    if char_length(v_title) > 200 then
      raise exception 'title_too_long' using errcode = '22023';
    end if;
    if char_length(v_body) > 20000 then
      raise exception 'body_too_long' using errcode = '22023';
    end if;

    v_slug := app_private.allocate_site_update_slug(v_title, p_slug, null);
    v_published := coalesce(p_published, false);

    insert into public.site_updates (
      slug,
      title,
      body,
      published,
      published_at,
      created_by,
      updated_by
    ) values (
      v_slug,
      v_title,
      v_body,
      v_published,
      case when v_published then timezone('utc', now()) else null end,
      p_actor_id,
      p_actor_id
    )
    returning * into v_row;

    perform app_private.audit_moderation(
      p_actor_id,
      p_actor_id,
      'create_site_update',
      'created site update',
      jsonb_build_object(
        'id', v_row.id,
        'slug', v_row.slug,
        'published', v_row.published
      )
    );
  else
    select * into v_row from public.site_updates where id = p_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;

    v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_row.title);
    v_body := coalesce(nullif(trim(coalesce(p_body, '')), ''), v_row.body);
    if char_length(v_title) > 200 then
      raise exception 'title_too_long' using errcode = '22023';
    end if;
    if char_length(v_body) > 20000 then
      raise exception 'body_too_long' using errcode = '22023';
    end if;

    if v_row.published or v_row.published_at is not null then
      v_slug := v_row.slug;
    elsif p_slug is not null and length(trim(p_slug)) > 0 then
      v_slug := app_private.allocate_site_update_slug(v_title, p_slug, p_id);
    else
      v_slug := v_row.slug;
    end if;

    v_published := coalesce(p_published, v_row.published);

    update public.site_updates s
    set
      slug = v_slug,
      title = v_title,
      body = v_body,
      published = v_published,
      published_at = case
        when v_published and s.published_at is null then timezone('utc', now())
        when v_published then s.published_at
        else s.published_at
      end,
      updated_at = timezone('utc', now()),
      updated_by = p_actor_id
    where s.id = p_id
    returning * into v_row;

    perform app_private.audit_moderation(
      p_actor_id,
      p_actor_id,
      'update_site_update',
      'updated site update',
      jsonb_build_object(
        'id', v_row.id,
        'slug', v_row.slug,
        'published', v_row.published
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'update', app_private.site_update_to_json(v_row)
  );
end;
$$;

create or replace function public.moderation_delete_site_update(
  p_actor_id uuid,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_row public.site_updates%rowtype;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'id_required' using errcode = '22023';
  end if;

  delete from public.site_updates s
  where s.id = p_id
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform app_private.audit_moderation(
    p_actor_id,
    p_actor_id,
    'delete_site_update',
    'deleted site update',
    jsonb_build_object(
      'id', v_row.id,
      'slug', v_row.slug,
      'published', v_row.published
    )
  );

  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

revoke all on function public.get_public_site_updates(integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_public_site_update(text)
  from public, anon, authenticated;
revoke all on function public.moderation_list_site_updates(uuid)
  from public, anon, authenticated;
revoke all on function public.moderation_upsert_site_update(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.moderation_delete_site_update(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_public_site_updates(integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.get_public_site_update(text)
  to anon, authenticated, service_role;
grant execute on function public.moderation_list_site_updates(uuid)
  to service_role;
grant execute on function public.moderation_upsert_site_update(uuid, uuid, text, text, text, boolean)
  to service_role;
grant execute on function public.moderation_delete_site_update(uuid, uuid)
  to service_role;