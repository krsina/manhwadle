import { getTodayKey } from './daily'
import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'
import { isSupabaseConfigured, supabase } from './supabase'
import {
  readSecretRoundElapsedMs,
  reportNightOwlIfLateLocalHour,
  reportSecretEvent,
} from './secretEvents'

/** All ranked modes use six guesses. */
export const DAILY_MAX_GUESSES = 6
export const POINTS_AWARDED_EVENT = 'manhwadle:points-awarded'

export interface PointsAwardedDetail {
  delta: number
  balance: number
  mode: StatsModeId
  /** Play XP from this award only (excludes same-txn achievement unlocks when known). */
  playPointDelta?: number
  source?: 'daily_completion' | 'bonus_name'
}

let lastPointsAwarded: PointsAwardedDetail | null = null
let lastPointsAwardedAt = 0

export function getLastPointsAwarded(): PointsAwardedDetail | null {
  return Date.now() - lastPointsAwardedAt <= 30_000 ? lastPointsAwarded : null
}

export interface CompleteDailyModePayload {
  mode: StatsModeId
  taste: ReaderTaste
  guessIds: number[]
  hintsUsed: number
  hardMode: boolean
  surrendered: boolean
}

export type RankedSubmitSkipReason =
  | 'unconfigured'
  | 'anonymous'
  | 'practice'
  | 'archive'
  | 'duplicate'

export type RankedSubmitResult =
  | { status: 'skipped'; reason: RankedSubmitSkipReason }
  | {
      status: 'ok'
      inserted: boolean
      dateKey: string
      mode: StatsModeId
      taste: ReaderTaste
      outcome: 'won' | 'lost'
      guessCount: number
      surrendered: boolean
      pointDelta: number
      /** Play XP from the daily_completion ledger row (0 on loss / when unknown). */
      playPointDelta: number
      pointsBalance: number
    }
  | { status: 'error'; warning: string; message: string }

export type BonusNameRewardSkipReason =
  | RankedSubmitSkipReason
  | 'incorrect'
  | 'not_first_try'

export type BonusNameRewardResult =
  | { status: 'skipped'; reason: BonusNameRewardSkipReason }
  | {
      status: 'ok'
      applied: boolean
      dateKey: string
      mode: StatsModeId
      taste: ReaderTaste
      pointDelta: number
      playPointDelta: number
      pointsBalance: number
    }
  | { status: 'error'; warning: string; message: string }

/** In-session dedupe for bonus-name reward RPCs. */
const bonusSubmittedKeys = new Set<string>()

function bonusRewardKey(userId: string, mode: StatsModeId, dateKey: string): string {
  return `bonus:${userId}:${dateKey}:${mode}`
}

function emitPointsAwarded(detail: PointsAwardedDetail): void {
  lastPointsAwarded = detail
  lastPointsAwardedAt = Date.now()
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<PointsAwardedDetail>(POINTS_AWARDED_EVENT, {
      detail,
    }),
  )
}

function parseNonNegInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? Math.max(0, Math.floor(value)) : fallback
}

const MODES: readonly StatsModeId[] = [
  'summary',
  'character',
  'cover',
  'heardle',
]
const TASTES: readonly ReaderTaste[] = ['action', 'romance', 'both']

/** In-session dedupe so terminal handlers can call submit safely more than once. */
const submittedKeys = new Set<string>()

export function rankedSubmissionKey(
  userId: string,
  mode: StatsModeId,
  dateKey: string,
): string {
  return `${userId}:${dateKey}:${mode}`
}

/** Clear idempotency cache (tests only). */
export function resetRankedSubmissionCache(): void {
  submittedKeys.clear()
  bonusSubmittedKeys.clear()
}

export function isSurrenderedLoss(
  status: 'playing' | 'won' | 'lost',
  guessCount: number,
  maxGuesses = DAILY_MAX_GUESSES,
): boolean {
  return status === 'lost' && guessCount < maxGuesses
}

export function shouldSubmitRankedCompletion(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  configured?: boolean
}): RankedSubmitSkipReason | null {
  if (!(input.configured ?? isSupabaseConfigured())) return 'unconfigured'
  if (!input.userId) return 'anonymous'
  if (input.isPractice) return 'practice'
  if (input.isArchive) return 'archive'
  return null
}

/**
 * Build / normalize the RPC payload. Throws on client-side shape errors
 * (server still re-validates everything against daily_puzzles).
 */
export function buildCompleteDailyModePayload(input: {
  mode: StatsModeId
  taste: ReaderTaste
  guessIds: number[]
  hintsUsed?: number
  hardMode?: boolean
  surrendered: boolean
}): CompleteDailyModePayload {
  if (!MODES.includes(input.mode)) {
    throw new Error(`Invalid mode: ${input.mode}`)
  }
  if (!TASTES.includes(input.taste)) {
    throw new Error(`Invalid taste: ${input.taste}`)
  }

  const guessIds = input.guessIds.map((id) => Number(id))
  if (guessIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Invalid guess id')
  }
  if (guessIds.length > DAILY_MAX_GUESSES) {
    throw new Error('Too many guesses')
  }
  if (new Set(guessIds).size !== guessIds.length) {
    throw new Error('Duplicate guesses are not allowed')
  }

  const hintsUsed = Math.max(0, Math.floor(Number(input.hintsUsed ?? 0)))
  if (hintsUsed > DAILY_MAX_GUESSES) {
    throw new Error('Invalid hints_used')
  }

  if (input.surrendered && guessIds.length >= DAILY_MAX_GUESSES) {
    throw new Error('Surrender requires fewer than max guesses')
  }

  return {
    mode: input.mode,
    taste: input.taste,
    guessIds,
    hintsUsed,
    hardMode: Boolean(input.hardMode),
    surrendered: Boolean(input.surrendered),
  }
}

/**
 * Submit a terminal daily round for server verification.
 * Failures never throw — local play continues; callers may log `warning`.
 */
export async function submitVerifiedDailyCompletion(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  mode: StatsModeId
  taste: ReaderTaste
  guessIds: number[]
  hintsUsed?: number
  hardMode?: boolean
  surrendered: boolean
  /** Optional override for idempotency key date (tests). Server uses UTC today. */
  dateKey?: string
}): Promise<RankedSubmitResult> {
  const skip = shouldSubmitRankedCompletion({
    userId: input.userId,
    isPractice: input.isPractice,
    isArchive: input.isArchive,
  })
  if (skip) return { status: 'skipped', reason: skip }

  const userId = input.userId!
  const dateKey = input.dateKey ?? getTodayKey()
  const key = rankedSubmissionKey(userId, input.mode, dateKey)
  if (submittedKeys.has(key)) {
    return { status: 'skipped', reason: 'duplicate' }
  }

  let payload: CompleteDailyModePayload
  try {
    payload = buildCompleteDailyModePayload({
      mode: input.mode,
      taste: input.taste,
      guessIds: input.guessIds,
      hintsUsed: input.hintsUsed,
      hardMode: input.hardMode,
      surrendered: input.surrendered,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      warning: 'ranked_payload_invalid',
      message,
    }
  }

  if (!supabase) {
    return { status: 'skipped', reason: 'unconfigured' }
  }

  // Mark before await so concurrent terminal handlers collapse to one RPC.
  submittedKeys.add(key)

  try {
    const rpcPayload = {
      p_mode: payload.mode,
      p_taste: payload.taste,
      p_guess_ids: payload.guessIds,
      p_hints_used: payload.hintsUsed,
      p_hard_mode: payload.hardMode,
      p_surrendered: payload.surrendered,
    }
    let { data, error } = await supabase.rpc('complete_daily_mode_with_reward', rpcPayload)

    // Preserve verified completions during a rolling deploy where the frontend
    // reaches an environment before the reward-wrapper migration is applied.
    if (
      error &&
      (error.message.includes('complete_daily_mode_with_reward') ||
        error.message.includes('schema cache'))
    ) {
      const fallback = await supabase.rpc('complete_daily_mode', rpcPayload)
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      submittedKeys.delete(key)
      return {
        status: 'error',
        warning: 'ranked_rpc_failed',
        message: error.message,
      }
    }

    const row = (data ?? {}) as Record<string, unknown>
    const outcome = row.outcome === 'won' || row.outcome === 'lost' ? row.outcome : null
    if (!row.ok || !outcome) {
      submittedKeys.delete(key)
      return {
        status: 'error',
        warning: 'ranked_rpc_unexpected',
        message: 'Unexpected complete_daily_mode response',
      }
    }

    return {
      status: 'ok',
      inserted: Boolean(row.inserted),
      dateKey: typeof row.date_key === 'string' ? row.date_key : dateKey,
      mode: (typeof row.mode === 'string' ? row.mode : payload.mode) as StatsModeId,
      taste: (typeof row.taste === 'string' ? row.taste : payload.taste) as ReaderTaste,
      outcome,
      guessCount:
        typeof row.guess_count === 'number' ? row.guess_count : payload.guessIds.length,
      surrendered: Boolean(row.surrendered),
      pointDelta: parseNonNegInt(row.point_delta),
      playPointDelta: parseNonNegInt(row.play_point_delta, parseNonNegInt(row.point_delta)),
      pointsBalance: parseNonNegInt(row.points_balance),
    }
  } catch (err) {
    submittedKeys.delete(key)
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      warning: 'ranked_rpc_failed',
      message,
    }
  }
}

/**
 * Award small double-solve XP after a first-try win + correct bonus name.
 * Failures never throw — local play continues.
 */
export async function submitBonusNameReward(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  mode: StatsModeId
  taste: ReaderTaste
  correct: boolean
  firstTry: boolean
  /** Optional override for idempotency key date (tests). Server uses UTC today. */
  dateKey?: string
}): Promise<BonusNameRewardResult> {
  const skip = shouldSubmitRankedCompletion({
    userId: input.userId,
    isPractice: input.isPractice,
    isArchive: input.isArchive,
  })
  if (skip) return { status: 'skipped', reason: skip }
  if (!input.correct) return { status: 'skipped', reason: 'incorrect' }
  if (!input.firstTry) return { status: 'skipped', reason: 'not_first_try' }

  if (!MODES.includes(input.mode)) {
    return { status: 'error', warning: 'bonus_payload_invalid', message: `Invalid mode: ${input.mode}` }
  }
  if (!TASTES.includes(input.taste)) {
    return { status: 'error', warning: 'bonus_payload_invalid', message: `Invalid taste: ${input.taste}` }
  }

  const userId = input.userId!
  const dateKey = input.dateKey ?? getTodayKey()
  const key = bonusRewardKey(userId, input.mode, dateKey)
  if (bonusSubmittedKeys.has(key)) {
    return { status: 'skipped', reason: 'duplicate' }
  }

  if (!supabase) {
    return { status: 'skipped', reason: 'unconfigured' }
  }

  bonusSubmittedKeys.add(key)

  try {
    const { data, error } = await supabase.rpc('complete_bonus_name_with_reward', {
      p_mode: input.mode,
      p_taste: input.taste,
      p_correct: true,
    })

    if (error) {
      bonusSubmittedKeys.delete(key)
      return {
        status: 'error',
        warning: 'bonus_rpc_failed',
        message: error.message,
      }
    }

    const row = (data ?? {}) as Record<string, unknown>
    if (!row.ok) {
      bonusSubmittedKeys.delete(key)
      return {
        status: 'error',
        warning: 'bonus_rpc_unexpected',
        message: 'Unexpected complete_bonus_name_with_reward response',
      }
    }

    return {
      status: 'ok',
      applied: Boolean(row.applied),
      dateKey: typeof row.date_key === 'string' ? row.date_key : dateKey,
      mode: (typeof row.mode === 'string' ? row.mode : input.mode) as StatsModeId,
      taste: (typeof row.taste === 'string' ? row.taste : input.taste) as ReaderTaste,
      pointDelta: parseNonNegInt(row.point_delta),
      playPointDelta: parseNonNegInt(row.play_point_delta, parseNonNegInt(row.point_delta)),
      pointsBalance: parseNonNegInt(row.points_balance),
    }
  } catch (err) {
    bonusSubmittedKeys.delete(key)
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      warning: 'bonus_rpc_failed',
      message,
    }
  }
}

/** Fire-and-forget helper that logs structured warnings without breaking local play. */
export function queueVerifiedDailyCompletion(
  input: Parameters<typeof submitVerifiedDailyCompletion>[0],
): void {
  lastPointsAwarded = null
  lastPointsAwardedAt = 0
  void submitVerifiedDailyCompletion(input).then((result) => {
    if (result.status === 'error') {
      console.warn('[ranked]', result.warning, result.message)
      return
    }
    if (result.status === 'ok' && result.inserted && typeof window !== 'undefined') {
      emitPointsAwarded({
        delta: result.pointDelta,
        balance: result.pointsBalance,
        mode: result.mode,
        playPointDelta: result.playPointDelta,
        source: 'daily_completion',
      })
      reportNightOwlIfLateLocalHour()
      if (!input.surrendered) {
        const elapsed = readSecretRoundElapsedMs(input.mode, input.dateKey ?? getTodayKey())
        if (elapsed != null && elapsed <= 60_000) {
          void reportSecretEvent('speedrun', { elapsed_ms: elapsed })
        }
      }
    }
  })
}

/** Fire-and-forget double-solve XP; additive with any prior daily completion award. */
export function queueBonusNameReward(
  input: Parameters<typeof submitBonusNameReward>[0],
): void {
  void submitBonusNameReward(input).then((result) => {
    if (result.status === 'error') {
      console.warn('[ranked]', result.warning, result.message)
      return
    }
    if (result.status === 'ok' && result.applied && typeof window !== 'undefined') {
      const prior = getLastPointsAwarded()
      const combinedDelta =
        prior && prior.mode === result.mode ? prior.delta + result.pointDelta : result.pointDelta
      const combinedPlay =
        prior && prior.mode === result.mode
          ? (prior.playPointDelta ?? prior.delta) + result.playPointDelta
          : result.playPointDelta
      emitPointsAwarded({
        delta: combinedDelta,
        balance: result.pointsBalance,
        mode: result.mode,
        playPointDelta: combinedPlay,
        source: 'bonus_name',
      })
    }
  })
}
