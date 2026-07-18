import { supabase, isSupabaseConfigured } from './supabase'
import {
  clampLeaderboardLimit,
  isLeaderboardBoard,
  parseLeaderboardPage,
  type LeaderboardBoard,
  type LeaderboardPage,
} from './leaderboard'
import { parseAchievementAwards, type AchievementAward } from './achievements'
import {
  getDevAchievements,
  getDevLeaderboardPage,
  getDevMyStanding,
} from './leaderboardDevFake'

export interface SiteModeStatus {
  mode: string
  available: boolean
  message: string | null
}

export interface PublicSiteStatus {
  bannerMessage: string | null
  bannerSeverity: 'info' | 'warning' | 'critical'
  maintenanceActive: boolean
  leaderboardEpochDate: string
  modes: SiteModeStatus[]
}

export interface MyLeaderboardStanding {
  eligible: boolean
  username: string | null
  anyCurrentStreak: number
  anyMaxStreak: number
  allCurrentStreak: number
  allMaxStreak: number
  totalCompletions: number
  boards: Partial<
    Record<LeaderboardBoard, { value: number; rank: number | null }>
  >
}

function asSeverity(value: unknown): 'info' | 'warning' | 'critical' {
  if (value === 'warning' || value === 'critical') return value
  return 'info'
}

export function parsePublicSiteStatus(raw: unknown): PublicSiteStatus | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok === false) return null
  const modesRaw = Array.isArray(row.modes) ? row.modes : []
  const modes: SiteModeStatus[] = []
  for (const item of modesRaw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (typeof m.mode !== 'string') continue
    modes.push({
      mode: m.mode,
      available: m.available !== false,
      message: typeof m.message === 'string' ? m.message : null,
    })
  }
  return {
    bannerMessage:
      typeof row.banner_message === 'string' && row.banner_message.trim()
        ? row.banner_message
        : null,
    bannerSeverity: asSeverity(row.banner_severity),
    maintenanceActive: row.maintenance_active === true,
    leaderboardEpochDate:
      typeof row.leaderboard_epoch_date === 'string'
        ? row.leaderboard_epoch_date
        : '2026-07-18',
    modes,
  }
}

export async function fetchPublicSiteStatus(): Promise<
  { ok: true; status: PublicSiteStatus } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_public_site_status')
  if (error) return { ok: false, error: error.message }
  const status = parsePublicSiteStatus(data)
  if (!status) return { ok: false, error: 'unexpected_response' }
  return { ok: true, status }
}

export async function fetchLeaderboard(input: {
  board: LeaderboardBoard
  limit?: number
  cursor?: string | null
}): Promise<{ ok: true; page: LeaderboardPage } | { ok: false; error: string }> {
  if (!isLeaderboardBoard(input.board)) {
    return { ok: false, error: 'invalid_board' }
  }
  const limit = clampLeaderboardLimit(input.limit)
  const fake = getDevLeaderboardPage(input.board, limit, input.cursor)
  if (fake) return { ok: true, page: fake }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_board: input.board,
    p_limit: limit,
    p_cursor: input.cursor ?? null,
  })
  if (error) return { ok: false, error: error.message }
  const page = parseLeaderboardPage(data)
  if (!page) return { ok: false, error: 'unexpected_response' }
  return { ok: true, page }
}

export function parseMyLeaderboardStanding(raw: unknown): MyLeaderboardStanding | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok !== true) return null
  const boardsRaw =
    row.boards && typeof row.boards === 'object'
      ? (row.boards as Record<string, unknown>)
      : {}
  const boards: MyLeaderboardStanding['boards'] = {}
  for (const key of ['all_mode_streak', 'longest_streak', 'current_streak'] as const) {
    const b = boardsRaw[key]
    if (!b || typeof b !== 'object') continue
    const bb = b as Record<string, unknown>
    boards[key] = {
      value: typeof bb.value === 'number' ? bb.value : 0,
      rank: typeof bb.rank === 'number' ? bb.rank : null,
    }
  }
  return {
    eligible: row.eligible === true,
    username: typeof row.username === 'string' ? row.username : null,
    anyCurrentStreak:
      typeof row.any_current_streak === 'number' ? row.any_current_streak : 0,
    anyMaxStreak: typeof row.any_max_streak === 'number' ? row.any_max_streak : 0,
    allCurrentStreak:
      typeof row.all_current_streak === 'number' ? row.all_current_streak : 0,
    allMaxStreak: typeof row.all_max_streak === 'number' ? row.all_max_streak : 0,
    totalCompletions:
      typeof row.total_completions === 'number' ? row.total_completions : 0,
    boards,
  }
}

export async function fetchMyLeaderboardStanding(): Promise<
  { ok: true; standing: MyLeaderboardStanding } | { ok: false; error: string }
> {
  const fake = getDevMyStanding()
  if (fake) return { ok: true, standing: fake }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_my_leaderboard_standing')
  if (error) return { ok: false, error: error.message }
  const standing = parseMyLeaderboardStanding(data)
  if (!standing) return { ok: false, error: 'unexpected_response' }
  return { ok: true, standing }
}

export async function fetchMyAchievements(): Promise<
  { ok: true; awards: AchievementAward[] } | { ok: false; error: string }
> {
  const fake = getDevAchievements()
  if (fake) return { ok: true, awards: fake }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_my_achievements')
  if (error) return { ok: false, error: error.message }
  return { ok: true, awards: parseAchievementAwards(data) }
}

export async function fetchMyTodayModeCompletions(): Promise<
  { ok: true; dateKey: string; modes: string[] } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_my_today_mode_completions')
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') return { ok: false, error: 'unexpected_response' }
  const row = data as Record<string, unknown>
  if (row.ok !== true) return { ok: false, error: 'unexpected_response' }
  const modes = Array.isArray(row.modes)
    ? row.modes.filter((m): m is string => typeof m === 'string')
    : []
  return {
    ok: true,
    dateKey: typeof row.date_key === 'string' ? row.date_key : '',
    modes,
  }
}
