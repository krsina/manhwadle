import { supabase } from './supabase'
import type { ReaderTaste } from './readerTaste'

export type AnalyticsMode = 'summary' | 'character' | 'cover' | 'heardle'

export interface AnalyticsSeriesRow {
  date_key: string
  mode: AnalyticsMode
  taste: ReaderTaste
  segment: 'signed'
  starts: number
  completions: number
  wins: number
  first_tries: number
  double_solves: number
  active_users: number
  guess_count_total: number
  hints_used_total: number
  hard_mode_plays: number
  guess_distribution: number[]
}

export interface OwnerAnalytics {
  startDate: string
  endDate: string
  generatedAt: string
  newAccounts: number
  signedActiveUsers: number
  signedStarts: number
  allModesPlayerDays: number
  signedPlayerDays: number
  series: AnalyticsSeriesRow[]
}

export interface AnalyticsFilters {
  startDate: string
  endDate: string
  mode?: AnalyticsMode | null
  taste?: ReaderTaste | null
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function parseAnalytics(raw: unknown): OwnerAnalytics | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok !== true || !Array.isArray(row.series)) return null

  const series = row.series.flatMap((item): AnalyticsSeriesRow[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    if (
      typeof value.date_key !== 'string' ||
      !['summary', 'character', 'cover', 'heardle'].includes(String(value.mode)) ||
      !['action', 'romance', 'both'].includes(String(value.taste)) ||
      value.segment !== 'signed'
    ) {
      return []
    }
    return [
      {
        date_key: value.date_key,
        mode: value.mode as AnalyticsMode,
        taste: value.taste as ReaderTaste,
        segment: 'signed',
        starts: numberValue(value.starts),
        completions: numberValue(value.completions),
        wins: numberValue(value.wins),
        first_tries: numberValue(value.first_tries),
        double_solves: numberValue(value.double_solves),
        active_users: numberValue(value.active_users),
        guess_count_total: numberValue(value.guess_count_total),
        hints_used_total: numberValue(value.hints_used_total),
        hard_mode_plays: numberValue(value.hard_mode_plays),
        guess_distribution: Array.isArray(value.guess_distribution)
          ? value.guess_distribution.slice(0, 6).map(numberValue)
          : [0, 0, 0, 0, 0, 0],
      },
    ]
  })

  return {
    startDate: String(row.start_date ?? ''),
    endDate: String(row.end_date ?? ''),
    generatedAt: String(row.generated_at ?? ''),
    newAccounts: numberValue(row.new_accounts),
    signedActiveUsers: numberValue(row.signed_active_users),
    signedStarts: numberValue(row.signed_starts),
    allModesPlayerDays: numberValue(row.all_modes_player_days),
    signedPlayerDays: numberValue(row.signed_player_days),
    series,
  }
}

export async function fetchOwnerAnalytics(
  filters: AnalyticsFilters,
  signal?: AbortSignal,
): Promise<{ ok: true; analytics: OwnerAnalytics } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sign in to continue.' }

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderation`,
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey:
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            import.meta.env.VITE_SUPABASE_ANON_KEY ||
            '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_analytics',
          start_date: filters.startDate,
          end_date: filters.endDate,
          mode: filters.mode ?? null,
          taste: filters.taste ?? null,
        }),
      },
    )
    const payload = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        error: String(payload.error ?? `Request failed (${response.status})`),
      }
    }
    const analytics = parseAnalytics(payload.analytics)
    return analytics
      ? { ok: true, analytics }
      : { ok: false, error: 'Unexpected analytics response' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'Request cancelled' }
    }
    return { ok: false, error: 'Unable to load analytics' }
  }
}

export function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}
