-- Authors (including staff) can soft-delete their own comments without going
-- through assert_can_target. Staff moderation reasons for comment status
-- changes are optional / blankable.

alter table public.site_update_comments
  drop constraint if exists site_update_comments_removal_reason_len;

alter table public.site_update_comments
  add constraint site_update_comments_removal_reason_len check (
    removal_reason is null
    or char_length(trim(removal_reason)) <= 500
  );

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
    and c.status in ('visible', 'pending')
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id);
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
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_previous_status text;
  v_row public.site_update_comments%rowtype;
  v_is_self boolean;
begin
  v_actor_role := app_private.assert_moderation_actor(p_actor_id, false);
  if p_status not in ('visible', 'removed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_too_long');
  end if;

  select * into v_row from public.site_update_comments where id = p_comment_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_previous_status := v_row.status;
  v_is_self := v_row.author_id = p_actor_id;

  -- Self-removal uses the author path; other self status changes are allowed
  -- without assert_can_target so staff can manage their own queued comments.
  if not v_is_self then
    perform app_private.assert_can_target(p_actor_id, v_actor_role, v_row.author_id);
  end if;

  update public.site_update_comments c
  set
    status = p_status,
    removed_at = case when p_status = 'removed' then timezone('utc', now()) else null end,
    removed_by = case when p_status = 'removed' then p_actor_id else null end,
    removal_reason = case
      when p_status = 'removed' and v_is_self then coalesce(v_reason, 'removed by author')
      when p_status = 'removed' then v_reason
      else null
    end,
    removed_by_author = case when p_status = 'removed' then v_is_self else false end,
    updated_at = timezone('utc', now())
  where c.id = p_comment_id
  returning * into v_row;

  if not v_is_self or p_status <> 'removed' then
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'comment', app_private.site_update_comment_to_json(v_row, true, p_actor_id)
  );
end;
$$;

revoke all on function public.delete_my_site_update_comment(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_my_site_update_comment(uuid)
  to authenticated, service_role;

revoke all on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.moderation_set_site_update_comment_status(uuid, uuid, text, text)
  to service_role;
