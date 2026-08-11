import { isSupabaseConfigured, supabase } from './supabase'

export const SAVED_LIST_MIN_ENTRIES = 3
export const SAVED_LIST_MAX_COUNT = 10
export const SAVED_LIST_MAX_NAME_LENGTH = 40

export interface SavedListSummary {
  id: string
  name: string
  entryCount: number
  createdAt: string | null
  updatedAt: string | null
}

export interface SavedList extends SavedListSummary {
  manhwaIds: number[]
}

export type SavedListResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; migrationMissing?: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function entryCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

export function parseSavedListSummary(raw: unknown): SavedListSummary | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const name = stringValue(raw.name)
  if (!id || !name) return null
  return {
    id,
    name,
    entryCount: entryCount(raw.entry_count),
    createdAt: nullableString(raw.created_at),
    updatedAt: nullableString(raw.updated_at),
  }
}

export function parseSavedList(raw: unknown): SavedList | null {
  const summary = parseSavedListSummary(raw)
  if (!summary || !isRecord(raw) || !Array.isArray(raw.manhwa_ids)) return null
  const manhwaIds = raw.manhwa_ids.filter(
    (id): id is number =>
      typeof id === 'number' && Number.isInteger(id) && id > 0,
  )
  if (manhwaIds.length !== raw.manhwa_ids.length) return null
  return { ...summary, manhwaIds }
}

export function savedListErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    list_not_found: 'That private list is unavailable.',
    invalid_list_name: 'Use a name between 1 and 40 characters.',
    list_name_taken: 'You already have a list with that name.',
    list_limit_reached: 'You can save up to 10 lists.',
    invalid_list_entries: 'Choose at least 3 catalog titles.',
    duplicate_list_title: 'Each title can appear only once.',
    list_title_not_in_catalog: 'One or more titles are not available for Versus.',
    rate_limited: 'Too many list changes. Wait a moment and try again.',
    not_configured: 'Saved lists are unavailable in this build.',
    unexpected_saved_list_response: 'Saved lists could not be loaded.',
  }
  return messages[error] ?? 'That list request could not be completed.'
}

function migrationMissing(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('schema cache') ||
    normalized.includes('could not find the function') ||
    normalized.includes('function public.saved_list_')
  )
}

function createKey(operation: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${operation}:${suffix}`
}

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<SavedListResult<Record<string, unknown>>> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: migrationMissing(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_saved_list_response',
      }
    }
    return { ok: true, value: data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
      migrationMissing: migrationMissing(message),
    }
  }
}

export async function listSavedLists(): Promise<
  SavedListResult<SavedListSummary[]>
> {
  const result = await call('saved_list_list_mine', {})
  if (!result.ok) return result
  const raw = result.value.lists
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'unexpected_saved_list_response' }
  }
  const lists = raw.map(parseSavedListSummary)
  return lists.every((list): list is SavedListSummary => list !== null)
    ? { ok: true, value: lists }
    : { ok: false, error: 'unexpected_saved_list_response' }
}

export async function getSavedList(
  listId: string,
): Promise<SavedListResult<SavedList>> {
  const result = await call('saved_list_get', { p_list_id: listId })
  if (!result.ok) return result
  const list = parseSavedList(result.value.list)
  return list
    ? { ok: true, value: list }
    : { ok: false, error: 'unexpected_saved_list_response' }
}

export async function createSavedList(input: {
  name: string
  manhwaIds: number[]
  idempotencyKey?: string
}): Promise<SavedListResult<SavedList>> {
  const result = await call('saved_list_create', {
    p_name: input.name,
    p_manhwa_ids: input.manhwaIds,
    p_idempotency_key: input.idempotencyKey ?? createKey('create-list'),
  })
  if (!result.ok) return result
  const list = parseSavedList(result.value.list)
  return list
    ? { ok: true, value: list }
    : { ok: false, error: 'unexpected_saved_list_response' }
}

export async function renameSavedList(input: {
  listId: string
  name: string
  idempotencyKey?: string
}): Promise<SavedListResult<SavedList>> {
  const result = await call('saved_list_rename', {
    p_list_id: input.listId,
    p_name: input.name,
    p_idempotency_key: input.idempotencyKey ?? createKey('rename-list'),
  })
  if (!result.ok) return result
  const list = parseSavedList(result.value.list)
  return list
    ? { ok: true, value: list }
    : { ok: false, error: 'unexpected_saved_list_response' }
}

export async function replaceSavedListEntries(input: {
  listId: string
  manhwaIds: number[]
  idempotencyKey?: string
}): Promise<SavedListResult<SavedList>> {
  const result = await call('saved_list_set_entries', {
    p_list_id: input.listId,
    p_manhwa_ids: input.manhwaIds,
    p_idempotency_key: input.idempotencyKey ?? createKey('replace-list'),
  })
  if (!result.ok) return result
  const list = parseSavedList(result.value.list)
  return list
    ? { ok: true, value: list }
    : { ok: false, error: 'unexpected_saved_list_response' }
}

export async function deleteSavedList(input: {
  listId: string
  idempotencyKey?: string
}): Promise<SavedListResult<true>> {
  const result = await call('saved_list_delete', {
    p_list_id: input.listId,
    p_idempotency_key: input.idempotencyKey ?? createKey('delete-list'),
  })
  return result.ok ? { ok: true, value: true } : result
}
