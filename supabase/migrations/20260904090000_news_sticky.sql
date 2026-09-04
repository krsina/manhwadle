-- Pin News posts to the top of /news and the homepage News panel.

alter table public.site_updates
  add column if not exists sticky boolean not null default false;

comment on column public.site_updates.sticky is
  'When true, a published post sorts above others on /news and the homepage News panel.';

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
    'kind', p_row.kind,
    'version', p_row.version,
    'published', p_row.published,
    'sticky', p_row.sticky,
    'published_at', p_row.published_at,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

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
        select jsonb_agg(j.obj order by j.sticky desc, j.published_at desc nulls last, j.created_at desc)
        from (
          select
            app_private.site_update_to_json(s) as obj,
            s.sticky,
            s.published_at,
            s.created_at
          from public.site_updates s
          where s.published = true
          order by s.sticky desc, s.published_at desc nulls last, s.created_at desc
          limit v_limit
          offset v_offset
        ) j
      ),
      '[]'::jsonb
    )
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
        select jsonb_agg(j.obj order by j.sticky desc, j.updated_at desc, j.created_at desc)
        from (
          select
            app_private.site_update_to_json(s) as obj,
            s.sticky,
            s.updated_at,
            s.created_at
          from public.site_updates s
          order by s.sticky desc, s.updated_at desc, s.created_at desc
          limit 200
        ) j
      ),
      '[]'::jsonb
    )
  );
end;
$$;

drop function if exists public.moderation_upsert_site_update(
  uuid, uuid, text, text, text, boolean, text, text
);

create function public.moderation_upsert_site_update(
  p_actor_id uuid,
  p_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_slug text default null,
  p_published boolean default null,
  p_version text default null,
  p_kind text default null,
  p_sticky boolean default null
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
  v_kind text;
  v_published boolean;
  v_sticky boolean;
begin
  if not app_private.has_role(p_actor_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_id is null then
    v_title := nullif(trim(coalesce(p_title, '')), '');
    v_body := nullif(trim(coalesce(p_body, '')), '');
    v_version := nullif(trim(coalesce(p_version, '')), '');
    v_kind := coalesce(nullif(trim(coalesce(p_kind, '')), ''), 'update');
    v_sticky := coalesce(p_sticky, false);

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
    if v_kind not in ('update', 'announcement') then
      raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if v_version is not null and v_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
      raise exception 'invalid_version' using errcode = '22023';
    end if;

    v_slug := app_private.allocate_site_update_slug(v_title, p_slug, null);
    v_published := coalesce(p_published, false);

    if v_published and v_kind = 'update' and v_version is null then
      raise exception 'version_required' using errcode = '22023';
    end if;

    insert into public.site_updates (
      slug,
      title,
      body,
      kind,
      version,
      published,
      sticky,
      published_at,
      created_by,
      updated_by
    ) values (
      v_slug,
      v_title,
      v_body,
      v_kind,
      v_version,
      v_published,
      v_sticky,
      case when v_published then timezone('utc', now()) else null end,
      p_actor_id,
      p_actor_id
    )
    returning * into v_row;

    perform app_private.audit_moderation(
      p_actor_id,
      p_actor_id,
      'create_site_update',
      'created news item',
      jsonb_build_object(
        'id', v_row.id,
        'slug', v_row.slug,
        'kind', v_row.kind,
        'version', v_row.version,
        'published', v_row.published,
        'sticky', v_row.sticky
      )
    );
  else
    select * into v_row from public.site_updates where id = p_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;

    v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_row.title);
    v_body := coalesce(nullif(trim(coalesce(p_body, '')), ''), v_row.body);
    v_kind := coalesce(nullif(trim(coalesce(p_kind, '')), ''), v_row.kind);
    v_sticky := coalesce(p_sticky, v_row.sticky);
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
    if v_kind not in ('update', 'announcement') then
      raise exception 'invalid_kind' using errcode = '22023';
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
    if v_published and v_kind = 'update' and v_version is null then
      raise exception 'version_required' using errcode = '22023';
    end if;

    update public.site_updates s
    set
      slug = v_slug,
      title = v_title,
      body = v_body,
      kind = v_kind,
      version = v_version,
      published = v_published,
      sticky = v_sticky,
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
      'updated news item',
      jsonb_build_object(
        'id', v_row.id,
        'slug', v_row.slug,
        'kind', v_row.kind,
        'version', v_row.version,
        'published', v_row.published,
        'sticky', v_row.sticky
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'update', app_private.site_update_to_json(v_row)
  );
end;
$$;

revoke all on function public.moderation_upsert_site_update(
  uuid, uuid, text, text, text, boolean, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.moderation_upsert_site_update(
  uuid, uuid, text, text, text, boolean, text, text, boolean
) to service_role;

update public.site_updates
set sticky = true
where slug = 'welcome-newcomers';
