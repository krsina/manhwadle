-- Layered abuse controls for News comments.
-- Obvious spam is rejected without retaining its body; uncertain content is
-- held for staff review and never appears in public comment reads.

alter table public.site_update_comments
  drop constraint if exists site_update_comments_status;
alter table public.site_update_comments
  drop constraint if exists site_update_comments_status_check;
alter table public.site_update_comments
  drop constraint if exists site_update_comments_removal_shape;
alter table public.site_update_comments
  drop constraint if exists site_update_comments_removal_shape_check;

alter table public.site_update_comments
  add column if not exists filter_category text,
  add column if not exists filter_rule text,
  add column if not exists body_fingerprint text;

alter table public.site_update_comments
  add constraint site_update_comments_status_check check (
    status = any (array['visible'::text, 'pending'::text, 'removed'::text])
  ),
  add constraint site_update_comments_filter_metadata_len check (
    (filter_category is null or char_length(filter_category) between 1 and 50)
    and (filter_rule is null or char_length(filter_rule) between 1 and 100)
  ),
  add constraint site_update_comments_pending_shape check (
    status <> 'pending'
    or (filter_category is not null and filter_rule is not null)
  ),
  add constraint site_update_comments_removal_shape_check check (
    (status in ('visible', 'pending')
      and removed_at is null
      and removed_by is null
      and removal_reason is null
      and removed_by_author = false)
    or
    (status = 'removed' and removed_at is not null)
  );

create index if not exists site_update_comments_pending_idx
  on public.site_update_comments (created_at asc, id)
  where status = 'pending';

create table if not exists app_private.comment_filter_rules (
  code text primary key,
  category text not null,
  action text not null check (action in ('reject', 'quarantine')),
  pattern text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint comment_filter_rules_code_len check (char_length(code) between 1 and 100),
  constraint comment_filter_rules_category_len check (char_length(category) between 1 and 50)
);

alter table app_private.comment_filter_rules enable row level security;
revoke all on table app_private.comment_filter_rules from public, anon, authenticated;
grant all on table app_private.comment_filter_rules to service_role;

insert into app_private.comment_filter_rules (
  code, category, action, pattern, priority
) values
  (
    'targeted_self_harm',
    'harassment',
    'quarantine',
    '(^|[^[:alnum:]_])(kys|kill[[:space:]]+yourself)($|[^[:alnum:]_])',
    10
  ),
  (
    'credible_threat',
    'threat',
    'quarantine',
    '(^|[^[:alnum:]_])(i[[:space:]]+(will|am[[:space:]]+going[[:space:]]+to)|gonna)[[:space:]]+(kill|hurt|doxx?)($|[^[:alnum:]_])',
    20
  ),
  (
    'explicit_solicitation',
    'sexual_content',
    'quarantine',
    '(^|[^[:alnum:]_])(send[[:space:]]+nudes?|onlyfans|porn)($|[^[:alnum:]_])',
    30
  ),
  (
    'severe_slur_1',
    'hate_speech',
    'quarantine',
    '(^|[^[:alnum:]_])n+[i1!]+[gq]+[e3a@]*r+s?($|[^[:alnum:]_])',
    40
  ),
  (
    'severe_slur_2',
    'hate_speech',
    'quarantine',
    '(^|[^[:alnum:]_])f+[a@4]+[gq]+[o0]*t+s?($|[^[:alnum:]_])',
    41
  ),
  (
    'common_spam_pitch',
    'spam',
    'quarantine',
    '(^|[^[:alnum:]_])(buy[[:space:]]+cheap|free[[:space:]]+(money|crypto)|crypto[[:space:]]+giveaway|click[[:space:]]+here)($|[^[:alnum:]_])',
    60
  )
on conflict (code) do update set
  category = excluded.category,
  action = excluded.action,
  pattern = excluded.pattern,
  priority = excluded.priority,
  enabled = true;

create table if not exists app_private.comment_filter_aggregates (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_date date not null,
  action text not null check (action in ('reject', 'quarantine')),
  category text not null,
  rule_code text not null,
  body_fingerprint text not null,
  event_count integer not null default 1 check (event_count >= 1),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, event_date, action, rule_code, body_fingerprint)
);

alter table app_private.comment_filter_aggregates enable row level security;
revoke all on table app_private.comment_filter_aggregates from public, anon, authenticated;
grant all on table app_private.comment_filter_aggregates to service_role;

create or replace function app_private.normalize_comment_body(p_body text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select lower(
    regexp_replace(
      trim(coalesce(p_body, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function app_private.classify_comment_body(p_body text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
declare
  v_normalized text := app_private.normalize_comment_body(p_body);
  v_url_count integer;
  v_word_count integer;
  v_distinct_words integer;
  v_rule app_private.comment_filter_rules%rowtype;
begin
  if translate(coalesce(p_body, ''), E'\n\r\t', '') ~ '[[:cntrl:]]' then
    return jsonb_build_object(
      'action', 'reject',
      'category', 'malformed',
      'rule', 'control_characters'
    );
  end if;

  v_url_count := regexp_count(
    v_normalized,
    '(https?://[^[:space:]]+|www\.[^[:space:]]+|[[:alnum:]-]+\.(com|net|org|xyz|io)(/[^[:space:]]*)?([[:space:]]|$))'
  );
  if v_url_count >= 2 then
    return jsonb_build_object(
      'action', 'reject',
      'category', 'spam',
      'rule', 'excessive_links'
    );
  end if;

  if v_normalized ~ '([^[:space:]])\1{11,}' then
    return jsonb_build_object(
      'action', 'reject',
      'category', 'spam',
      'rule', 'repeated_characters'
    );
  end if;

  select count(*)::integer, count(distinct w)::integer
  into v_word_count, v_distinct_words
  from regexp_split_to_table(v_normalized, '[^[:alnum:]_]+') w
  where w <> '';

  if v_word_count >= 8 and v_distinct_words <= 2 then
    return jsonb_build_object(
      'action', 'reject',
      'category', 'spam',
      'rule', 'repeated_words'
    );
  end if;

  select * into v_rule
  from app_private.comment_filter_rules r
  where r.enabled and v_normalized ~ r.pattern
  order by r.priority asc, r.code asc
  limit 1;

  if found then
    return jsonb_build_object(
      'action', v_rule.action,
      'category', v_rule.category,
      'rule', v_rule.code
    );
  end if;

  if v_url_count = 1 then
    return jsonb_build_object(
      'action', 'quarantine',
      'category', 'external_link',
      'rule', 'single_external_link'
    );
  end if;

  return jsonb_build_object(
    'action', 'allow',
    'category', null,
    'rule', null
  );
end;
$$;

create or replace function app_private.record_comment_filter_event(
  p_user_id uuid,
  p_action text,
  p_category text,
  p_rule_code text,
  p_body_fingerprint text
)
returns void
language sql
security definer
set search_path to 'pg_catalog', 'app_private'
as $$
  insert into app_private.comment_filter_aggregates (
    user_id,
    event_date,
    action,
    category,
    rule_code,
    body_fingerprint
  ) values (
    p_user_id,
    timezone('utc', now())::date,
    p_action,
    p_category,
    p_rule_code,
    p_body_fingerprint
  )
  on conflict (user_id, event_date, action, rule_code, body_fingerprint)
  do update set
    event_count = app_private.comment_filter_aggregates.event_count + 1,
    last_seen_at = timezone('utc', now());
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
        case when p_include_private then p_row.removed_by_author else null end,
      'filter_category',
        case when p_include_private then p_row.filter_category else null end,
      'filter_rule',
        case when p_include_private then p_row.filter_rule else null end
    )
  )
  from public.public_profiles pp
  left join public.user_avatar_profiles uap on uap.user_id = p_row.author_id
  where pp.user_id = p_row.author_id;
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
  v_normalized text;
  v_fingerprint text;
  v_update_id uuid;
  v_classification jsonb;
  v_action text;
  v_category text;
  v_rule text;
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

  if not app_private.consume_rpc_rate_limit(v_uid, 'post_site_update_comment', 5, 60)
     or not app_private.consume_rpc_rate_limit(v_uid, 'post_site_update_comment_hour', 10, 3600)
     or not app_private.consume_rpc_rate_limit(v_uid, 'post_site_update_comment_day', 20, 86400) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select s.id into v_update_id
  from public.site_updates s
  where s.slug = nullif(trim(coalesce(p_slug, '')), '')
    and s.published = true;
  if v_update_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_normalized := app_private.normalize_comment_body(v_body);
  v_fingerprint := md5(v_normalized);

  if exists (
    select 1
    from public.site_update_comments c
    where c.author_id = v_uid
      and c.body_fingerprint = v_fingerprint
      and c.created_at >= timezone('utc', now()) - interval '24 hours'
  ) then
    perform app_private.record_comment_filter_event(
      v_uid, 'reject', 'spam', 'recent_duplicate', v_fingerprint
    );
    return jsonb_build_object('ok', false, 'error', 'spam_rejected');
  end if;

  v_classification := app_private.classify_comment_body(v_body);
  v_action := v_classification->>'action';
  v_category := v_classification->>'category';
  v_rule := v_classification->>'rule';

  if v_action = 'reject' then
    perform app_private.record_comment_filter_event(
      v_uid, 'reject', v_category, v_rule, v_fingerprint
    );
    return jsonb_build_object('ok', false, 'error', 'spam_rejected');
  end if;

  if v_action = 'quarantine' then
    insert into public.site_update_comments (
      site_update_id,
      author_id,
      body,
      status,
      filter_category,
      filter_rule,
      body_fingerprint
    ) values (
      v_update_id,
      v_uid,
      v_body,
      'pending',
      v_category,
      v_rule,
      v_fingerprint
    )
    returning * into v_row;

    perform app_private.record_comment_filter_event(
      v_uid, 'quarantine', v_category, v_rule, v_fingerprint
    );
    return jsonb_build_object('ok', true, 'outcome', 'pending');
  end if;

  insert into public.site_update_comments (
    site_update_id, author_id, body, body_fingerprint
  ) values (
    v_update_id, v_uid, v_body, v_fingerprint
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'visible',
    'comment', app_private.site_update_comment_to_json(v_row, false, v_uid)
  );
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
  v_pending_total integer;
begin
  perform app_private.assert_moderation_actor(p_actor_id, false);
  if v_status is not null and v_status not in ('visible', 'pending', 'removed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select count(*)::integer into v_total
  from public.site_update_comments c
  join public.site_updates s on s.id = c.site_update_id
  where (v_status is null or c.status = v_status)
    and (p_post_slug is null or s.slug = p_post_slug);

  select count(*)::integer into v_pending_total
  from public.site_update_comments c
  join public.site_updates s on s.id = c.site_update_id
  where c.status = 'pending'
    and (p_post_slug is null or s.slug = p_post_slug);

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'pending_total', v_pending_total,
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
  v_previous_status text;
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
  v_previous_status := v_row.status;
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
    case
      when v_previous_status = 'pending' and p_status = 'visible'
        then 'approve_quarantined_news_comment'
      when v_previous_status = 'pending' and p_status = 'removed'
        then 'remove_quarantined_news_comment'
      when p_status = 'removed' then 'remove_news_comment'
      else 'restore_news_comment'
    end,
    v_reason,
    jsonb_build_object(
      'comment_id', v_row.id,
      'site_update_id', v_row.site_update_id,
      'previous_status', v_previous_status,
      'filter_category', v_row.filter_category,
      'filter_rule', v_row.filter_rule
    )
  );

  return jsonb_build_object(
    'ok', true,
    'comment', app_private.site_update_comment_to_json(v_row, true, p_actor_id)
  );
end;
$$;

revoke all on function app_private.normalize_comment_body(text)
  from public, anon, authenticated;
revoke all on function app_private.classify_comment_body(text)
  from public, anon, authenticated;
revoke all on function app_private.record_comment_filter_event(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app_private.normalize_comment_body(text)
  to postgres, service_role;
grant execute on function app_private.classify_comment_body(text)
  to postgres, service_role;
grant execute on function app_private.record_comment_filter_event(uuid, text, text, text, text)
  to postgres, service_role;

revoke all on function public.post_site_update_comment(text, text)
  from public, anon, authenticated;
grant execute on function public.post_site_update_comment(text, text)
  to authenticated, service_role;
revoke all on function public.moderation_list_site_update_comments(uuid, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.moderation_list_site_update_comments(uuid, text, integer, integer, text)
  to service_role;
grant execute on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  to service_role;
