import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'
import { isSupabaseConfigured, supabase } from './supabase'

export type AttemptStatus = 'active' | 'won' | 'lost' | 'surrendered'

export interface DailyAttemptPublic {
  dateKey: string
  mode: StatsModeId
  taste: ReaderTaste
  hardMode: boolean
  hintsUsed: number
  guessIds: number[]
  guessCount: number
  maxGuesses: number
  status: AttemptStatus
  characterId: number | null
  meta: Record<string, unknown> | null
  /** Present only when the attempt is terminal. */
  answerId: number | null
  finalizedAt: string | null
}

export interface DailyCompletionReward {
  ok: boolean
  inserted: boolean
  dateKey: string
  mode: StatsModeId
  taste: ReaderTaste
  outcome: 'won' | 'lost'
  guessCount: number
  hintsUsed: number
  hardMode: boolean
  surrendered: boolean
  answerId: number | null
  characterId: number | null
  completedAt: string | null
  pointDelta: number
  playPointDelta: number
  pointsBalance: number
}

export interface DailyPlayState {
  ok: true
  dateKey: string
  mode: StatsModeId
  taste: ReaderTaste
  meta: Record<string, unknown> | null
  maxGuesses: number
  attempt: DailyAttemptPublic | null
}

export type DailyPlayStateResult =
  | DailyPlayState
  | { ok: false; error: string; migrationMissing?: boolean }

export type DailyAttemptRpcError =
  | { ok: false; error: string; migrationMissing?: boolean; attempt?: DailyAttemptPublic }

function parseNonNegInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
}

function parseOptionalInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  return n > 0 ? n : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Detect PostgREST "function not in schema cache" / missing RPC. */
export function isMissingRpcError(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('schema cache') ||
    m.includes('could not find the function') ||
    m.includes('function public.get_daily_play_state') ||
    m.includes('function public.start_daily_attempt') ||
    m.includes('function public.submit_daily_guess') ||
    m.includes('function public.finalize_daily_attempt')
  )
}

function parseGuessIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((id) => (typeof id === 'number' ? Math.floor(id) : Number(id)))
    .filter((id) => Number.isInteger(id) && id > 0)
}

export function parseDailyAttemptPublic(raw: unknown): DailyAttemptPublic | null {
  if (!isRecord(raw)) return null
  const status = raw.status
  if (
    status !== 'active' &&
    status !== 'won' &&
    status !== 'lost' &&
    status !== 'surrendered'
  ) {
    return null
  }
  const guessIds = parseGuessIds(raw.guess_ids)
  const terminal = status !== 'active'
  return {
    dateKey: typeof raw.date_key === 'string' ? raw.date_key : '',
    mode: (typeof raw.mode === 'string' ? raw.mode : 'summary') as StatsModeId,
    taste: (typeof raw.taste === 'string' ? raw.taste : 'both') as ReaderTaste,
    hardMode: Boolean(raw.hard_mode),
    hintsUsed: parseNonNegInt(raw.hints_used),
    guessIds,
    guessCount: parseNonNegInt(raw.guess_count, guessIds.length),
    maxGuesses: parseNonNegInt(raw.max_guesses, 6) || 6,
    status,
    characterId: terminal ? parseOptionalInt(raw.character_id) : null,
    meta: isRecord(raw.meta) ? raw.meta : null,
    answerId: terminal ? parseOptionalInt(raw.answer_id) : null,
    finalizedAt: typeof raw.finalized_at === 'string' ? raw.finalized_at : null,
  }
}

export function parseDailyCompletionReward(raw: unknown): DailyCompletionReward | null {
  if (!isRecord(raw) || raw.ok !== true) return null
  const outcome = raw.outcome === 'won' || raw.outcome === 'lost' ? raw.outcome : null
  if (!outcome) return null
  return {
    ok: true,
    inserted: Boolean(raw.inserted),
    dateKey: typeof raw.date_key === 'string' ? raw.date_key : '',
    mode: (typeof raw.mode === 'string' ? raw.mode : 'summary') as StatsModeId,
    taste: (typeof raw.taste === 'string' ? raw.taste : 'both') as ReaderTaste,
    outcome,
    guessCount: parseNonNegInt(raw.guess_count),
    hintsUsed: parseNonNegInt(raw.hints_used),
    hardMode: Boolean(raw.hard_mode),
    surrendered: Boolean(raw.surrendered),
    answerId: parseOptionalInt(raw.answer_id),
    characterId: parseOptionalInt(raw.character_id),
    completedAt: typeof raw.completed_at === 'string' ? raw.completed_at : null,
    pointDelta: parseNonNegInt(raw.point_delta),
    playPointDelta: parseNonNegInt(raw.play_point_delta, parseNonNegInt(raw.point_delta)),
    pointsBalance: parseNonNegInt(raw.points_balance),
  }
}

/**
 * Clue-safe today play state. Never includes answer_id (attempt may reveal it
 * only when terminal).
 */
export async function fetchDailyPlayState(
  mode: StatsModeId,
  taste: ReaderTaste,
): Promise<DailyPlayStateResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc('get_daily_play_state', {
      p_mode: mode,
      p_taste: taste,
    })
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_play_state',
      }
    }
    return {
      ok: true,
      dateKey: typeof data.date_key === 'string' ? data.date_key : '',
      mode: (typeof data.mode === 'string' ? data.mode : mode) as StatsModeId,
      taste: (typeof data.taste === 'string' ? data.taste : taste) as ReaderTaste,
      meta: isRecord(data.meta) ? data.meta : null,
      maxGuesses: parseNonNegInt(data.max_guesses, 6) || 6,
      attempt: parseDailyAttemptPublic(data.attempt),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingRpcError(message),
    }
  }
}

export type StartDailyAttemptResult =
  | {
      ok: true
      created: boolean
      alreadyCompleted: boolean
      attempt: DailyAttemptPublic | null
      answerId: number | null
      completion?: DailyCompletionReward
      raw: Record<string, unknown>
    }
  | DailyAttemptRpcError

export async function startDailyAttempt(input: {
  mode: StatsModeId
  taste: ReaderTaste
  hardMode?: boolean
  idempotencyKey?: string
}): Promise<StartDailyAttemptResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc('start_daily_attempt', {
      p_mode: input.mode,
      p_taste: input.taste,
      p_hard_mode: Boolean(input.hardMode),
      p_idempotency_key: input.idempotencyKey ?? null,
    })
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      const attempt = isRecord(data) ? parseDailyAttemptPublic(data.attempt) : null
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_start',
        attempt: attempt ?? undefined,
      }
    }
    const attempt = parseDailyAttemptPublic(data.attempt)
    const answerId =
      parseOptionalInt(data.answer_id) ?? attempt?.answerId ?? null
    return {
      ok: true,
      created: Boolean(data.created),
      alreadyCompleted: Boolean(data.already_completed),
      attempt,
      answerId,
      raw: data,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingRpcError(message),
    }
  }
}

export type SubmitDailyGuessResult =
  | {
      ok: true
      accepted: boolean
      correct: boolean
      guessId: number | null
      guessCount: number
      finalized: boolean
      attempt: DailyAttemptPublic | null
      completion: DailyCompletionReward | null
      reason?: string
    }
  | DailyAttemptRpcError

export async function submitDailyGuess(input: {
  mode: StatsModeId
  taste: ReaderTaste
  guessId: number
  hintsUsed?: number
  idempotencyKey?: string
}): Promise<SubmitDailyGuessResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc('submit_daily_guess', {
      p_mode: input.mode,
      p_taste: input.taste,
      p_guess_id: input.guessId,
      p_hints_used: input.hintsUsed ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
    })
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_guess',
        attempt: isRecord(data)
          ? parseDailyAttemptPublic(data.attempt) ?? undefined
          : undefined,
      }
    }
    const attempt = parseDailyAttemptPublic(data.attempt)
    return {
      ok: true,
      accepted: Boolean(data.accepted),
      correct: Boolean(data.correct),
      guessId: parseOptionalInt(data.guess_id),
      guessCount: parseNonNegInt(data.guess_count, attempt?.guessCount ?? 0),
      finalized: Boolean(data.finalized),
      attempt,
      completion: parseDailyCompletionReward(data.completion),
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingRpcError(message),
    }
  }
}

export type FinalizeDailyAttemptResult =
  | {
      ok: true
      finalized: true
      alreadyTerminal: boolean
      attempt: DailyAttemptPublic | null
      completion: DailyCompletionReward | null
    }
  | DailyAttemptRpcError

export async function finalizeDailyAttempt(input: {
  mode: StatsModeId
  taste: ReaderTaste
  surrendered?: boolean
  hintsUsed?: number
  idempotencyKey?: string
}): Promise<FinalizeDailyAttemptResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc('finalize_daily_attempt', {
      p_mode: input.mode,
      p_taste: input.taste,
      p_surrendered: Boolean(input.surrendered),
      p_hints_used: input.hintsUsed ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
    })
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_finalize',
        attempt: isRecord(data)
          ? parseDailyAttemptPublic(data.attempt) ?? undefined
          : undefined,
      }
    }
    return {
      ok: true,
      finalized: true,
      alreadyTerminal: Boolean(data.already_terminal),
      attempt: parseDailyAttemptPublic(data.attempt),
      completion: parseDailyCompletionReward(data.completion),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingRpcError(message),
    }
  }
}

/** Map server attempt status onto local DayState status. */
export function dayStatusFromAttempt(
  status: AttemptStatus,
): 'playing' | 'won' | 'lost' {
  if (status === 'won') return 'won'
  if (status === 'lost' || status === 'surrendered') return 'lost'
  return 'playing'
}
