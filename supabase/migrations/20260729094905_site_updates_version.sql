alter table public.site_updates
  add column if not exists version text;

alter table public.site_updates
  drop constraint if exists site_updates_version_format;

alter table public.site_updates
  add constraint site_updates_version_format check (
    version is null
    or version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  );

create unique index if not exists site_updates_version_uidx
  on public.site_updates (version)
  where version is not null;

comment on column public.site_updates.version is
  'Semver-style product version for this changelog entry (MAJOR.MINOR.PATCH).';

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
    'version', p_row.version,
    'published', p_row.published,
    'published_at', p_row.published_at,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

create or replace function public.moderation_upsert_site_update(
  p_actor_id uuid,
  p_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_slug text default null,
  p_published boolean default null,
  p_version text default null
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
  v_version text;
  v_published boolean;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_id is null then
    v_title := nullif(trim(coalesce(p_title, '')), '');
    v_body := nullif(trim(coalesce(p_body, '')), '');
    v_version := nullif(trim(coalesce(p_version, '')), '');
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
    if v_version is not null and v_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
      raise exception 'invalid_version' using errcode = '22023';
    end if;

    v_slug := app_private.allocate_site_update_slug(v_title, p_slug, null);
    v_published := coalesce(p_published, false);

    if v_published and v_version is null then
      raise exception 'version_required' using errcode = '22023';
    end if;

    insert into public.site_updates (
      slug, title, body, version, published, published_at, created_by, updated_by
    ) values (
      v_slug, v_title, v_body, v_version, v_published,
      case when v_published then timezone('utc', now()) else null end,
      p_actor_id, p_actor_id
    )
    returning * into v_row;

    perform app_private.audit_moderation(
      p_actor_id, p_actor_id, 'create_site_update', 'created site update',
      jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'version', v_row.version, 'published', v_row.published)
    );
  else
    select * into v_row from public.site_updates where id = p_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;

    v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_row.title);
    v_body := coalesce(nullif(trim(coalesce(p_body, '')), ''), v_row.body);
    if p_version is null then
      v_version := v_row.version;
    else
      v_version := nullif(trim(p_version), '');
    end if;

    if char_length(v_title) > 200 then
      raise exception 'title_too_long' using errcode = '22023';
    end if;
    if char_length(v_body) > 20000 then
      raise exception 'body_too_long' using errcode = '22023';
    end if;
    if v_version is not null and v_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
      raise exception 'invalid_version' using errcode = '22023';
    end if;

    if v_row.published or v_row.published_at is not null then
      v_slug := v_row.slug;
    elsif p_slug is not null and length(trim(p_slug)) > 0 then
      v_slug := app_private.allocate_site_update_slug(v_title, p_slug, p_id);
    else
      v_slug := v_row.slug;
    end if;

    v_published := coalesce(p_published, v_row.published);

    if v_published and v_version is null then
      raise exception 'version_required' using errcode = '22023';
    end if;

    update public.site_updates s
    set
      slug = v_slug,
      title = v_title,
      body = v_body,
      version = v_version,
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
      p_actor_id, p_actor_id, 'update_site_update', 'updated site update',
      jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'version', v_row.version, 'published', v_row.published)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'update', app_private.site_update_to_json(v_row)
  );
end;
$$;

revoke all on function public.moderation_upsert_site_update(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.moderation_upsert_site_update(uuid, uuid, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.moderation_upsert_site_update(uuid, uuid, text, text, text, boolean, text)
  to service_role;