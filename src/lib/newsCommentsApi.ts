import {
  deleteDevMyNewsComment,
  editDevMyNewsComment,
  isNewsDevFakeActive,
  listDevNewsComments,
  postDevNewsComment,
} from './newsDevFake'
import { normalizeEquippedStageId } from './avatarStages'
import { NEWS_COMMENT_MAX_LENGTH } from './newsCommentModeration'
import { isSupabaseConfigured, supabase } from './supabase'

export { NEWS_COMMENT_MAX_LENGTH } from './newsCommentModeration'

export interface NewsComment {
  id: string
  username: string
  avatarId: string
  /** Equipped stage backdrop, rendered behind the avatar. */
  stageId: string
  body: string
  status: 'visible' | 'removed'
  createdAt: string
  updatedAt: string
  isMine: boolean
}

export function parseNewsComment(raw: unknown): NewsComment | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (
    typeof row.id !== 'string' ||
    typeof row.username !== 'string' ||
    typeof row.body !== 'string' ||
    (row.status !== 'visible' && row.status !== 'removed') ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    return null
  }
  return {
    id: row.id,
    username: row.username,
    avatarId: typeof row.avatar_id === 'string' ? row.avatar_id : 'avatar_default_female',
    stageId: normalizeEquippedStageId(row.stage_id),
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: row.is_mine === true,
  }
}

function responseError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error
  }
  return fallback
}

export async function fetchNewsComments(
  slug: string,
  limit = 25,
  offset = 0,
): Promise<
  { ok: true; comments: NewsComment[]; total: number } | { ok: false; error: string }
> {
  if (isNewsDevFakeActive()) {
    const result = listDevNewsComments(slug, limit, offset)
    if ('error' in result) return { ok: false, error: result.error }
    return { ok: true, comments: result.comments, total: result.total }
  }
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: 'unconfigured' }
  const { data, error } = await supabase.rpc('get_site_update_comments', {
    p_slug: slug,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'unexpected_response' }
  }
  const payload = data as { ok?: boolean; comments?: unknown; total?: unknown }
  if (payload.ok !== true || !Array.isArray(payload.comments)) {
    return { ok: false, error: responseError(data, 'unexpected_response') }
  }
  return {
    ok: true,
    comments: payload.comments
      .map(parseNewsComment)
      .filter((row): row is NewsComment => row !== null),
    total: typeof payload.total === 'number' ? payload.total : 0,
  }
}

export async function postNewsComment(
  slug: string,
  body: string,
): Promise<
  | { ok: true; outcome: 'visible'; comment: NewsComment }
  | { ok: true; outcome: 'pending' }
  | { ok: false; error: string }
> {
  if (isNewsDevFakeActive()) {
    return postDevNewsComment(slug, body)
  }
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('post_site_update_comment', {
    p_slug: slug,
    p_body: body.trim(),
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return { ok: false, error: responseError(data, 'unexpected_response') }
  }
  const payload = data as { outcome?: unknown; comment?: unknown }
  if (payload.outcome === 'pending') return { ok: true, outcome: 'pending' }
  const comment = parseNewsComment(payload.comment)
  return payload.outcome === 'visible' && comment
    ? { ok: true, outcome: 'visible', comment }
    : { ok: false, error: 'unexpected_response' }
}

export async function editMyNewsComment(
  commentId: string,
  body: string,
): Promise<
  | { ok: true; outcome: 'visible'; comment: NewsComment }
  | { ok: true; outcome: 'pending' }
  | { ok: false; error: string }
> {
  if (isNewsDevFakeActive()) {
    return editDevMyNewsComment(commentId, body)
  }
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('edit_my_site_update_comment', {
    p_comment_id: commentId,
    p_body: body.trim(),
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return { ok: false, error: responseError(data, 'unexpected_response') }
  }
  const payload = data as { outcome?: unknown; comment?: unknown }
  if (payload.outcome === 'pending') return { ok: true, outcome: 'pending' }
  const comment = parseNewsComment(payload.comment)
  return payload.outcome === 'visible' && comment
    ? { ok: true, outcome: 'visible', comment }
    : { ok: false, error: 'unexpected_response' }
}

export async function deleteMyNewsComment(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isNewsDevFakeActive()) {
    return deleteDevMyNewsComment(commentId)
  }
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('delete_my_site_update_comment', {
    p_comment_id: commentId,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return { ok: false, error: responseError(data, 'unexpected_response') }
  }
  return { ok: true }
}

export function newsCommentErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    body_required: 'Write a comment before posting.',
    body_too_long: `Comments can be at most ${NEWS_COMMENT_MAX_LENGTH} characters.`,
    spam_rejected: 'This comment looks like spam and was not submitted.',
    rate_limited: 'You are commenting too quickly. Please try again later.',
    comment_banned: 'This account is not currently allowed to post comments.',
    public_profile_required: 'Choose a public username before commenting.',
    not_authenticated: 'Sign in before commenting.',
    not_found: 'This News post is no longer available.',
  }
  return messages[error] ?? 'Could not submit the comment. Please try again.'
}
