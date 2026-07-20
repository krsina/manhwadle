import { DEFAULT_AVATAR_ID, normalizeEquippedAvatarId } from './avatarComposition'
import { DEFAULT_STAGE_ID, normalizeEquippedStageId } from './avatarStages'

/**
 * Community board helpers: unique ordinal ranks, opaque keyset cursors, board ids.
 * Server is source of truth; these mirror pagination/rank parsing for tests + UI.
 */

export const LEADERBOARD_BOARDS = [
  'all_mode_streak',
  'longest_streak',
  'current_streak',
] as const

export type LeaderboardBoard = (typeof LEADERBOARD_BOARDS)[number]

export const LEADERBOARD_DEFAULT_LIMIT = 25
export const LEADERBOARD_MAX_LIMIT = 100

export interface LeaderboardEntry {
  rank: number
  username: string
  value: number
  /** Opaque public id — never an auth UUID */
  publicId: string
  /** Equipped whole-character avatar id (public catalog). */
  equippedAvatarId: string
  /** Equipped stage backdrop id (public catalog). */
  equippedStageId: string
  /** Optional first-achieved time (ms) for local ordinal ranking. */
  achievedAtMs?: number
}

export interface LeaderboardPage {
  board: LeaderboardBoard
  entries: LeaderboardEntry[]
  nextCursor: string | null
  hasMore: boolean
}

/** Cursor v2: value + first-achieved timestamp + public_id. */
export interface LeaderboardCursorPayload {
  v: 2
  board: LeaderboardBoard
  /** Sort value (streak length) */
  value: number
  /** First-achieved / tiebreak time (ISO) */
  t: string
  /** public_id tie-break */
  p: string
}

export function isLeaderboardBoard(value: unknown): value is LeaderboardBoard {
  return (
    typeof value === 'string' &&
    (LEADERBOARD_BOARDS as readonly string[]).includes(value)
  )
}

export function clampLeaderboardLimit(limit: number | undefined | null): number {
  if (limit == null || !Number.isFinite(limit)) return LEADERBOARD_DEFAULT_LIMIT
  const n = Math.floor(limit)
  if (n < 1) return 1
  return Math.min(n, LEADERBOARD_MAX_LIMIT)
}

/**
 * Unique ordinal ranks after rows are already sorted (1, 2, 3, …).
 * Prefer {@link sortLeaderboardEntries} then this, or {@link assignOrdinalRanks}.
 */
export function assignOrdinalRanks<T>(rows: readonly T[]): Array<T & { rank: number }> {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

/** @deprecated Use assignOrdinalRanks — kept for older tests naming. */
export const assignDenseRanks = assignOrdinalRanks

/**
 * Sort: higher value first, earlier first-achieved next, then publicId.
 * Matches server get_leaderboard ordering.
 */
export function sortLeaderboardEntries<
  T extends { value: number; publicId: string; achievedAtMs?: number },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.value !== b.value) return b.value - a.value
    const atA = a.achievedAtMs
    const atB = b.achievedAtMs
    if (atA != null && atB != null && atA !== atB) return atA - atB
    if (atA != null && atB == null) return -1
    if (atA == null && atB != null) return 1
    return a.publicId.localeCompare(b.publicId)
  })
}

/** Assign unique ranks 1..n using the server tiebreak order. */
export function assignOrdinalRanksFromValues<
  T extends { value: number; publicId: string; achievedAtMs?: number },
>(rows: readonly T[]): Array<T & { rank: number }> {
  return assignOrdinalRanks(sortLeaderboardEntries(rows))
}

/**
 * Stable keyset compare: higher value first, earlier t next, then publicId.
 * Callers pass ISO `t` strings (lexicographic ISO-8601 works for UTC).
 */
export function compareLeaderboardRows(
  a: { value: number; t: string; p: string },
  b: { value: number; t: string; p: string },
): number {
  if (a.value !== b.value) return b.value - a.value
  if (a.t !== b.t) return a.t < b.t ? -1 : 1
  if (a.p !== b.p) return a.p < b.p ? -1 : 1
  return 0
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToUtf8(value: string): string {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeLeaderboardCursor(payload: LeaderboardCursorPayload): string {
  return utf8ToBase64(JSON.stringify(payload))
}

export function decodeLeaderboardCursor(
  cursor: string | null | undefined,
): LeaderboardCursorPayload | null {
  if (!cursor || typeof cursor !== 'string') return null
  try {
    const raw = JSON.parse(base64ToUtf8(cursor)) as Partial<LeaderboardCursorPayload>
    if (raw.v !== 2) return null
    if (!isLeaderboardBoard(raw.board)) return null
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return null
    if (typeof raw.t !== 'string' || !raw.t) return null
    if (typeof raw.p !== 'string' || !raw.p) return null
    return {
      v: 2,
      board: raw.board,
      value: raw.value,
      t: raw.t,
      p: raw.p,
    }
  } catch {
    return null
  }
}

/** True when `row` sorts after the keyset cursor (for next page). */
export function isAfterLeaderboardCursor(
  row: { value: number; t: string; p: string },
  cursor: LeaderboardCursorPayload,
): boolean {
  return compareLeaderboardRows(row, {
    value: cursor.value,
    t: cursor.t,
    p: cursor.p,
  }) > 0
}

export function parseLeaderboardPage(raw: unknown): LeaderboardPage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (!isLeaderboardBoard(row.board)) return null
  if (!Array.isArray(row.entries)) return null
  const entries: LeaderboardEntry[] = []
  for (const item of row.entries) {
    if (!item || typeof item !== 'object') return null
    const e = item as Record<string, unknown>
    if (typeof e.rank !== 'number' || !Number.isFinite(e.rank)) return null
    if (typeof e.username !== 'string' || !e.username) return null
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return null
    if (typeof e.public_id !== 'string' || !e.public_id) return null
    // Hard reject auth-looking leakage fields if a buggy server ever adds them.
    if ('user_id' in e || 'email' in e || 'taste' in e) return null
    entries.push({
      rank: e.rank,
      username: e.username,
      value: e.value,
      publicId: e.public_id,
      equippedAvatarId: normalizeEquippedAvatarId(
        typeof e.equipped_avatar_id === 'string' ? e.equipped_avatar_id : DEFAULT_AVATAR_ID,
      ),
      equippedStageId: normalizeEquippedStageId(
        typeof e.equipped_stage_id === 'string' ? e.equipped_stage_id : DEFAULT_STAGE_ID,
      ),
    })
  }
  const nextCursor =
    typeof row.next_cursor === 'string' && row.next_cursor.length > 0
      ? row.next_cursor
      : null
  return {
    board: row.board,
    entries,
    nextCursor,
    hasMore: row.has_more === true || Boolean(nextCursor),
  }
}

export function boardLabel(board: LeaderboardBoard): string {
  switch (board) {
    case 'all_mode_streak':
      return 'All-mode streak'
    case 'longest_streak':
      return 'Longest streak'
    case 'current_streak':
      return 'Current streak'
  }
}

export function boardBlurb(board: LeaderboardBoard): string {
  switch (board) {
    case 'all_mode_streak':
      return 'Longest run of finishing every mode in a day'
    case 'longest_streak':
      return 'Best any-mode streak of all time'
    case 'current_streak':
      return 'Longest current any-mode streak'
  }
}
