-- Authors may edit their own visible/pending news comments. Edits re-run
-- the same classifier as posts and can move a comment into quarantine.

create or replace function public.edit_my_site_update_comment(
  p_comment_id uuid,
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
  v_classification jsonb;
  v_action text;
  v_category text;
  v_rule text;
  v_row public.site_update_comments%rowtype;
  v_previous public.site_update_comments%rowtype;
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

  if not app_private.consume_rpc_rate_limit(v_uid, 'edit_site_update_comment', 8, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_previous
  from public.site_update_comments
  where id = p_comment_id
    and author_id = v_uid
    and status in ('visible', 'pending');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if trim(v_previous.body) = v_body then
    return jsonb_build_object(
      'ok', true,
      'outcome', v_previous.status,
      'comment', app_private.site_update_comment_to_json(v_previous, false, v_uid)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_normalized := app_private.normalize_comment_body(v_body);
  v_fingerprint := md5(v_normalized);

  if exists (
    select 1
    from public.site_update_comments c
    where c.author_id = v_uid
      and c.id <> p_comment_id
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
    update public.site_update_comments c
    set
      body = v_body,
      status = 'pending',
      filter_category = v_category,
      filter_rule = v_rule,
      body_fingerprint = v_fingerprint,
      updated_at = timezone('utc', now())
    where c.id = p_comment_id
    returning * into v_row;

    perform app_private.record_comment_filter_event(
      v_uid, 'quarantine', v_category, v_rule, v_fingerprint
    );
    return jsonb_build_object('ok', true, 'outcome', 'pending');
  end if;

  update public.site_update_comments c
  set
    body = v_body,
    status = 'visible',
    filter_category = null,
    filter_rule = null,
    body_fingerprint = v_fingerprint,
    updated_at = timezone('utc', now())
  where c.id = p_comment_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'visible',
    'comment', app_private.site_update_comment_to_json(v_row, false, v_uid)
  );
end;
$$;

revoke all on function public.edit_my_site_update_comment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.edit_my_site_update_comment(uuid, text)
  to authenticated, service_role;
