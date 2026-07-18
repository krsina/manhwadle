import type { ReaderTaste } from './readerTaste'
import { isReaderTaste } from './readerTaste'
import { supabase } from './supabase'
import { usernameErrorMessage, validateUsernameClient } from './username'

export type StaffRole = 'owner' | 'moderator'

export interface AccountSnapshot {
  userId: string
  username: string | null
  usernameNormalized: string | null
  usernameChangeRequired: boolean
  needsUsername: boolean
  usernameChangedAt: string | null
  nextChangeAt: string | null
  canChangeUsername: boolean
  readerTaste: ReaderTaste | null
  /** Server-reported; UI convenience only — never trust alone for authorization. */
  staffRole: StaffRole | null
  cloudBanned: boolean
  leaderboardExcluded: boolean
  canAppearPublicly: boolean
}

export type AccountMutationResult =
  | { ok: true; account?: AccountSnapshot; username?: string; nextChangeAt?: string | null }
  | { ok: false; error: string; nextChangeAt?: string | null }

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parseAccountSnapshot(raw: unknown): AccountSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok === false) return null
  const userId = asString(row.user_id)
  if (!userId) return null
  const tasteRaw = row.reader_taste
  return {
    userId,
    username: asString(row.username),
    usernameNormalized: asString(row.username_normalized),
    usernameChangeRequired: asBool(row.username_change_required),
    needsUsername: asBool(row.needs_username, true),
    usernameChangedAt: asString(row.username_changed_at),
    nextChangeAt: asString(row.next_change_at),
    canChangeUsername: asBool(row.can_change_username),
    readerTaste:
      typeof tasteRaw === 'string' && isReaderTaste(tasteRaw) ? tasteRaw : null,
    staffRole:
      row.staff_role === 'owner' || row.staff_role === 'moderator'
        ? row.staff_role
        : null,
    cloudBanned: asBool(row.cloud_banned),
    leaderboardExcluded: asBool(row.leaderboard_excluded),
    canAppearPublicly: asBool(row.can_appear_publicly, true),
  }
}

function rpcErrorMessage(data: unknown, fallback: string): AccountMutationResult {
  if (data && typeof data === 'object') {
    const row = data as Record<string, unknown>
    const code = asString(row.error) ?? fallback
    return {
      ok: false,
      error: usernameErrorMessage(code),
      nextChangeAt: asString(row.next_change_at),
    }
  }
  return { ok: false, error: usernameErrorMessage(fallback) }
}

export async function fetchMyAccount(): Promise<AccountSnapshot | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_my_account')
  if (error) {
    console.warn('[profile] get_my_account failed:', error.message)
    return null
  }
  return parseAccountSnapshot(data)
}

export async function claimUsername(raw: string): Promise<AccountMutationResult> {
  const client = validateUsernameClient(raw)
  if (!client.ok) {
    return { ok: false, error: usernameErrorMessage(client.error) }
  }
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data, error } = await supabase.rpc('claim_username', {
    p_username: client.username,
  })
  if (error) {
    return { ok: false, error: usernameErrorMessage('unavailable') }
  }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return rpcErrorMessage(data, 'unavailable')
  }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    username: asString(row.username) ?? client.username,
    nextChangeAt: asString(row.next_change_at),
  }
}

export async function changeUsername(raw: string): Promise<AccountMutationResult> {
  const client = validateUsernameClient(raw)
  if (!client.ok) {
    return { ok: false, error: usernameErrorMessage(client.error) }
  }
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data, error } = await supabase.rpc('change_username', {
    p_username: client.username,
  })
  if (error) {
    return { ok: false, error: usernameErrorMessage('unavailable') }
  }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return rpcErrorMessage(data, 'unavailable')
  }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    username: asString(row.username) ?? client.username,
    nextChangeAt: asString(row.next_change_at),
  }
}

export async function updateMySettings(input: {
  readerTaste?: ReaderTaste | null
}): Promise<AccountMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data, error } = await supabase.rpc('update_my_settings', {
    p_reader_taste: input.readerTaste ?? null,
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return rpcErrorMessage(data, 'unavailable')
  }
  return { ok: true }
}

export interface AccountExportPayload {
  exportedAt: string
  user: { id: string; email: string | null }
  profile: Record<string, unknown> | null
  settings: Record<string, unknown> | null
  playerStats: unknown[]
  dayProgress: unknown[]
  dailyCompletions: unknown[]
}

async function invokeAccountData(
  method: 'GET' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Sign in to continue.' }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-data`
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey:
        (import.meta.env.VITE_SUPABASE_ANON_KEY ||
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          '') as string,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
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

export async function exportMyAccountData(): Promise<
  { ok: true; data: AccountExportPayload } | { ok: false; error: string }
> {
  const result = await invokeAccountData('GET')
  if (!result.ok) return result
  return { ok: true, data: result.data as AccountExportPayload }
}

export async function deleteMyAccount(confirmation: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const result = await invokeAccountData('DELETE', { confirm: confirmation })
  if (!result.ok) return result
  return { ok: true }
}
