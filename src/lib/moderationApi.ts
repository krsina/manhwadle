import { supabase } from './supabase'

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

export const TEMP_DURATION_OPTIONS = [
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '14 days', hours: 24 * 14 },
  { label: '30 days', hours: 24 * 30 },
] as const

export function endsAtFromHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

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
