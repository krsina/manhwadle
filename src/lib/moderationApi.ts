import { supabase } from './supabase'
import { normalizeEquippedStageId } from './avatarStages'
import type { SiteUpdateKind } from './siteUpdatesApi'
import {
  issueDevCommentBan,
  isNewsDevFakeActive,
  listDevModerationNewsComments,
  revokeDevCommentBan,
  setDevNewsCommentStatus,
} from './newsDevFake'

export type StaffRole = 'owner' | 'moderator'

export type ModerationAction =
  | 'lookup_username'
  | 'list_reports'
  | 'list_appeals'
  | 'list_audit'
  | 'set_report_status'
  | 'set_appeal_status'
  | 'force_username_change'
  | 'issue_cloud_ban'
  | 'issue_leaderboard_exclusion'
  | 'revoke_restriction'
  | 'grant_role'
  | 'revoke_role'
  | 'block_identity'
  | 'get_site_status'
  | 'set_site_status'
  | 'set_mode_status'
  | 'set_outage_exemption'
  | 'set_account_flags'
  | 'list_site_updates'
  | 'upsert_site_update'
  | 'delete_site_update'
  | 'list_site_update_comments'
  | 'set_site_update_comment_status'
  | 'issue_comment_ban'
  | 'revoke_comment_ban'

export interface UserLookupResult {
  ok: boolean
  user_id?: string
  username?: string | null
  username_normalized?: string | null
  username_change_required?: boolean
  staff_role?: StaffRole | null
  cloud_banned?: boolean
  leaderboard_excluded?: boolean
  force_username_change?: boolean
  error?: string
}

export interface ModerationNewsComment {
  id: string
  authorId: string
  username: string
  avatarId: string
  /** Equipped stage backdrop, rendered behind the avatar. */
  stageId: string
  body: string
  status: 'visible' | 'pending' | 'removed'
  createdAt: string
  updatedAt: string
  removedAt: string | null
  removalReason: string | null
  removedByAuthor: boolean
  filterCategory: string | null
  filterRule: string | null
  postId: string
  postTitle: string
  postSlug: string
}

export function parseModerationNewsComment(raw: unknown): ModerationNewsComment | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (
    typeof row.id !== 'string' ||
    typeof row.author_id !== 'string' ||
    typeof row.username !== 'string' ||
    typeof row.body !== 'string' ||
    (row.status !== 'visible' && row.status !== 'pending' && row.status !== 'removed') ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string' ||
    typeof row.post_id !== 'string' ||
    typeof row.post_title !== 'string' ||
    typeof row.post_slug !== 'string'
  ) {
    return null
  }
  return {
    id: row.id,
    authorId: row.author_id,
    username: row.username,
    avatarId: typeof row.avatar_id === 'string' ? row.avatar_id : 'avatar_default_female',
    stageId: normalizeEquippedStageId(row.stage_id),
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    removedAt: typeof row.removed_at === 'string' ? row.removed_at : null,
    removalReason: typeof row.removal_reason === 'string' ? row.removal_reason : null,
    removedByAuthor: row.removed_by_author === true,
    filterCategory: typeof row.filter_category === 'string' ? row.filter_category : null,
    filterRule: typeof row.filter_rule === 'string' ? row.filter_rule : null,
    postId: row.post_id,
    postTitle: row.post_title,
    postSlug: row.post_slug,
  }
}

export const TEMP_DURATION_OPTIONS = [
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '14 days', hours: 24 * 14 },
  { label: '30 days', hours: 24 * 30 },
] as const

export function endsAtFromHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

/** Account menu / staff area. Server authorization remains authoritative. */
export function canUseModerationUi(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'moderator'
}

export function parseUserLookup(raw: unknown): UserLookupResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok === false) {
    return {
      ok: false,
      error: typeof row.error === 'string' ? row.error : 'not_found',
    }
  }
  if (row.ok !== true || typeof row.user_id !== 'string') return null
  return {
    ok: true,
    user_id: row.user_id,
    username: typeof row.username === 'string' ? row.username : null,
    username_normalized:
      typeof row.username_normalized === 'string' ? row.username_normalized : null,
    username_change_required: row.username_change_required === true,
    staff_role:
      row.staff_role === 'owner' || row.staff_role === 'moderator'
        ? row.staff_role
        : null,
    cloud_banned: row.cloud_banned === true,
    leaderboard_excluded: row.leaderboard_excluded === true,
    force_username_change: row.force_username_change === true,
  }
}

async function invokeModeration(
  action: ModerationAction,
  body: Record<string, unknown> = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Sign in to continue.' }

  if ('actor_id' in body || 'actorId' in body) {
    return { ok: false, error: 'Invalid request' }
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderation`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey:
        (import.meta.env.VITE_SUPABASE_ANON_KEY ||
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          '') as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`
    return { ok: false, error: message }
  }

  return { ok: true, data: payload }
}

export async function moderationLookupUsername(username: string) {
  const result = await invokeModeration('lookup_username', { username: username.trim() })
  if (!result.ok) return result
  const payload = result.data as { result?: unknown }
  const parsed = parseUserLookup(payload.result)
  if (!parsed) return { ok: false as const, error: 'Unexpected lookup response' }
  return { ok: true as const, user: parsed }
}

export async function moderationListReports(status?: string) {
  return invokeModeration('list_reports', status ? { status } : {})
}

export async function moderationListAppeals(status?: string) {
  return invokeModeration('list_appeals', status ? { status } : {})
}

export async function moderationListAudit(targetUserId?: string) {
  return invokeModeration(
    'list_audit',
    targetUserId ? { target_user_id: targetUserId } : {},
  )
}

export async function moderationSetReportStatus(
  reportId: number | string,
  status: 'reviewing' | 'resolved' | 'dismissed',
  reason: string,
) {
  return invokeModeration('set_report_status', {
    report_id: reportId,
    status,
    reason,
  })
}

export async function moderationSetAppealStatus(
  appealId: number | string,
  status: 'reviewing' | 'accepted' | 'denied',
  reason: string,
) {
  return invokeModeration('set_appeal_status', {
    appeal_id: appealId,
    status,
    reason,
  })
}

export async function moderationBlockIdentity(input: {
  kind: 'email' | 'provider_subject'
  value: string
  provider?: string
  reason: string
}) {
  return invokeModeration('block_identity', {
    kind: input.kind,
    value: input.value,
    provider: input.provider,
    reason: input.reason,
  })
}

export async function moderationForceRename(targetUserId: string, reason: string) {
  return invokeModeration('force_username_change', {
    target_user_id: targetUserId,
    reason,
  })
}

export async function moderationIssueCloudBan(input: {
  targetUserId: string
  reason: string
  endsAt?: string
  permanent?: boolean
}) {
  return invokeModeration('issue_cloud_ban', {
    target_user_id: input.targetUserId,
    reason: input.reason,
    ends_at: input.endsAt ?? null,
    permanent: input.permanent === true,
  })
}

export async function moderationIssueLeaderboardExclusion(input: {
  targetUserId: string
  reason: string
  endsAt?: string
  permanent?: boolean
}) {
  return invokeModeration('issue_leaderboard_exclusion', {
    target_user_id: input.targetUserId,
    reason: input.reason,
    ends_at: input.endsAt ?? null,
    permanent: input.permanent === true,
  })
}

export async function moderationRevokeRestriction(
  targetUserId: string,
  kind: string,
  reason: string,
) {
  return invokeModeration('revoke_restriction', {
    target_user_id: targetUserId,
    kind,
    reason,
  })
}

export async function moderationGrantRole(
  targetUserId: string,
  role: StaffRole,
  reason: string,
) {
  return invokeModeration('grant_role', {
    target_user_id: targetUserId,
    role,
    reason,
  })
}

export async function moderationRevokeRole(
  targetUserId: string,
  role: StaffRole,
  reason: string,
) {
  return invokeModeration('revoke_role', {
    target_user_id: targetUserId,
    role,
    reason,
  })
}

export async function submitUserReport(input: {
  targetUsername: string
  reasonCode: string
  details: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('submit_user_report', {
    p_target_username: input.targetUsername,
    p_reason_code: input.reasonCode,
    p_details: input.details,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'unavailable'
    return { ok: false, error: code }
  }
  return { ok: true }
}

export async function submitModerationAppeal(input: {
  kind: string
  details: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('submit_moderation_appeal', {
    p_kind: input.kind,
    p_details: input.details,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'unavailable'
    return { ok: false, error: code }
  }
  return { ok: true }
}

/** Owner-only site / mode status console. */
export async function moderationGetSiteStatus() {
  return invokeModeration('get_site_status')
}

export async function moderationSetSiteStatus(input: {
  bannerMessage?: string | null
  bannerSeverity?: 'info' | 'warning' | 'critical'
  maintenanceActive?: boolean
  leaderboardEpochDate?: string
  clearBanner?: boolean
}) {
  return invokeModeration('set_site_status', {
    banner_message: input.bannerMessage ?? null,
    banner_severity: input.bannerSeverity ?? null,
    maintenance_active:
      typeof input.maintenanceActive === 'boolean' ? input.maintenanceActive : null,
    leaderboard_epoch_date: input.leaderboardEpochDate ?? null,
    clear_banner: input.clearBanner === true,
  })
}

export async function moderationSetModeStatus(input: {
  mode: string
  available?: boolean
  message?: string | null
  requiredForAllMode?: boolean
  clearMessage?: boolean
}) {
  return invokeModeration('set_mode_status', {
    mode: input.mode,
    available: typeof input.available === 'boolean' ? input.available : null,
    message: input.message ?? null,
    required_for_all_mode:
      typeof input.requiredForAllMode === 'boolean' ? input.requiredForAllMode : null,
    clear_message: input.clearMessage === true,
  })
}

export async function moderationSetOutageExemption(input: {
  dateKey: string
  mode: string
  reason?: string
  remove?: boolean
}) {
  return invokeModeration('set_outage_exemption', {
    date_key: input.dateKey,
    mode: input.mode,
    reason: input.reason ?? '',
    remove: input.remove === true,
  })
}

export async function moderationSetAccountFlags(input: {
  targetUserId: string
  isTest?: boolean
  isSuspicious?: boolean
  notes?: string
}) {
  return invokeModeration('set_account_flags', {
    target_user_id: input.targetUserId,
    is_test: typeof input.isTest === 'boolean' ? input.isTest : null,
    is_suspicious: typeof input.isSuspicious === 'boolean' ? input.isSuspicious : null,
    notes: input.notes ?? null,
  })
}

/** Owner-only public News publishing. */
export async function moderationListSiteUpdates() {
  return invokeModeration('list_site_updates')
}

export async function moderationUpsertSiteUpdate(input: {
  id?: string | null
  title: string
  body: string
  slug?: string | null
  published?: boolean
  version?: string | null
  kind?: SiteUpdateKind
}) {
  return invokeModeration('upsert_site_update', {
    id: input.id ?? null,
    title: input.title,
    body: input.body,
    slug: input.slug ?? null,
    published: typeof input.published === 'boolean' ? input.published : null,
    version: input.version ?? null,
    kind: input.kind ?? null,
  })
}

export async function moderationDeleteSiteUpdate(id: string) {
  return invokeModeration('delete_site_update', { id })
}

export async function moderationListNewsComments(input: {
  status?: 'visible' | 'pending' | 'removed'
  limit?: number
  offset?: number
  postSlug?: string
} = {}): Promise<
  | { ok: true; comments: ModerationNewsComment[]; total: number; pendingTotal: number }
  | { ok: false; error: string }
> {
  if (isNewsDevFakeActive()) {
    const result = listDevModerationNewsComments(input)
    return {
      ok: true,
      comments: result.comments,
      total: result.total,
      pendingTotal: result.pendingTotal,
    }
  }
  const result = await invokeModeration('list_site_update_comments', {
    status: input.status ?? null,
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
    post_slug: input.postSlug ?? null,
  })
  if (!result.ok) return result
  const outer = result.data as { result?: unknown }
  if (!outer.result || typeof outer.result !== 'object') {
    return { ok: false, error: 'Unexpected comments response' }
  }
  const payload = outer.result as {
    ok?: boolean
    comments?: unknown
    total?: unknown
    pending_total?: unknown
  }
  if (payload.ok !== true || !Array.isArray(payload.comments)) {
    return { ok: false, error: 'Unexpected comments response' }
  }
  return {
    ok: true,
    comments: payload.comments
      .map(parseModerationNewsComment)
      .filter((row): row is ModerationNewsComment => row !== null),
    total: typeof payload.total === 'number' ? payload.total : 0,
    pendingTotal: typeof payload.pending_total === 'number' ? payload.pending_total : 0,
  }
}

export async function moderationSetNewsCommentStatus(input: {
  commentId: string
  status: 'visible' | 'removed'
  reason: string
}) {
  if (isNewsDevFakeActive()) {
    return setDevNewsCommentStatus(input)
  }
  return invokeModeration('set_site_update_comment_status', {
    comment_id: input.commentId,
    status: input.status,
    reason: input.reason,
  })
}

export async function moderationIssueCommentBan(input: {
  targetUserId: string
  reason: string
  endsAt?: string
  permanent?: boolean
}) {
  if (isNewsDevFakeActive()) {
    if (input.reason.trim().length < 3) return { ok: false as const, error: 'reason required' }
    return issueDevCommentBan(input.targetUserId)
  }
  return invokeModeration('issue_comment_ban', {
    target_user_id: input.targetUserId,
    reason: input.reason,
    ends_at: input.endsAt ?? null,
    permanent: input.permanent === true,
  })
}

export async function moderationRevokeCommentBan(targetUserId: string, reason: string) {
  if (isNewsDevFakeActive()) {
    if (reason.trim().length < 3) return { ok: false as const, error: 'reason required' }
    return revokeDevCommentBan(targetUserId)
  }
  return invokeModeration('revoke_comment_ban', {
    target_user_id: targetUserId,
    reason,
  })
}
