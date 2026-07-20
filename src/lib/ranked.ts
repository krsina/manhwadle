import { getTodayKey } from './daily'
import {
  finalizeDailyAttempt,
  startDailyAttempt,
  submitDailyGuess,
  type DailyCompletionReward,
} from './dailyAttempt'
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

export type RankedSubmitSkipReason =
  | 'unconfigured'
  | 'anonymous'
  | 'practice'
  | 'archive'
  | 'duplicate'
  | 'migration_missing'

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
      answerId: number | null
      characterId: number | null
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
      reason?: string
    }
  | { status: 'error'; warning: string; message: string }

/** In-session dedupe for bonus-name reward RPCs. */
const bonusSubmittedKeys = new Set<string>()

/** Modes that already started a server attempt this session. */
const startedAttemptKeys = new Set<string>()

/** When start/guess RPCs are missing, never fall back to forgeable completions. */
const migrationMissingKeys = new Set<string>()

function bonusRewardKey(userId: string, mode: StatsModeId, dateKey: string): string {
  return `bonus:${userId}:${dateKey}:${mode}`
}

function attemptSessionKey(userId: string, mode: StatsModeId, dateKey: string): string {
  return `attempt:${userId}:${dateKey}:${mode}`
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
  startedAttemptKeys.clear()
  migrationMissingKeys.clear()
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

/** Signed-in current-day ranked play must use server attempts (no answer_id leak). */
export function shouldUseServerRankedAttempt(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  configured?: boolean
}): boolean {
  return shouldSubmitRankedCompletion(input) === null
}

function completionToOkResult(
  completion: DailyCompletionReward,
  fallback: { mode: StatsModeId; taste: ReaderTaste; dateKey: string },
): Extract<RankedSubmitResult, { status: 'ok' }> {
  return {
    status: 'ok',
    inserted: completion.inserted,
    dateKey: completion.dateKey || fallback.dateKey,
    mode: completion.mode || fallback.mode,
    taste: completion.taste || fallback.taste,
    outcome: completion.outcome,
    guessCount: completion.guessCount,
    surrendered: completion.surrendered,
    pointDelta: completion.pointDelta,
    playPointDelta: completion.playPointDelta,
    pointsBalance: completion.pointsBalance,
    answerId: completion.answerId,
    characterId: completion.characterId,
  }
}

/**
 * Ensure a server attempt exists before ranked guesses.
 * Never falls back to forgeable complete_daily_mode* RPCs.
 */
export async function ensureRankedAttemptStarted(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  mode: StatsModeId
  taste: ReaderTaste
  hardMode?: boolean
  dateKey?: string
}): Promise<
  | { status: 'skipped'; reason: RankedSubmitSkipReason }
  | { status: 'ok'; alreadyCompleted: boolean; answerId: number | null }
  | { status: 'error'; warning: string; message: string }
> {
  const skip = shouldSubmitRankedCompletion({
    userId: input.userId,
    isPractice: input.isPractice,
    isArchive: input.isArchive,
  })
  if (skip) return { status: 'skipped', reason: skip }

  const userId = input.userId!
  const dateKey = input.dateKey ?? getTodayKey()
  const key = attemptSessionKey(userId, input.mode, dateKey)
  if (migrationMissingKeys.has(key)) {
    return { status: 'skipped', reason: 'migration_missing' }
  }
  if (startedAttemptKeys.has(key)) {
    return { status: 'ok', alreadyCompleted: false, answerId: null }
  }

  const result = await startDailyAttempt({
    mode: input.mode,
    taste: input.taste,
    hardMode: input.hardMode,
    idempotencyKey: `start:${key}`,
  })

  if (!result.ok) {
    if (result.migrationMissing) {
      migrationMissingKeys.add(key)
      return { status: 'skipped', reason: 'migration_missing' }
    }
    return {
      status: 'error',
      warning: 'ranked_attempt_start_failed',
      message: result.error,
    }
  }

  startedAttemptKeys.add(key)
  if (result.alreadyCompleted) {
    submittedKeys.add(rankedSubmissionKey(userId, input.mode, dateKey))
  }
  return {
    status: 'ok',
    alreadyCompleted: result.alreadyCompleted,
    answerId: result.answerId,
  }
}

/**
 * Submit one ranked guess via the server attempt flow.
 */
export async function submitRankedDailyGuess(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  mode: StatsModeId
  taste: ReaderTaste
  guessId: number
  hintsUsed?: number
  hardMode?: boolean
  dateKey?: string
}): Promise<
  | { status: 'skipped'; reason: RankedSubmitSkipReason }
  | {
      status: 'ok'
      correct: boolean
      accepted: boolean
      finalized: boolean
      guessIds: number[]
      dayStatus: 'playing' | 'won' | 'lost'
      answerId: number | null
      characterId: number | null
      completion: DailyCompletionReward | null
    }
  | { status: 'error'; warning: string; message: string }
> {
  const started = await ensureRankedAttemptStarted(input)
  if (started.status !== 'ok') return started

  const userId = input.userId!
  const dateKey = input.dateKey ?? getTodayKey()
  const sessionKey = attemptSessionKey(userId, input.mode, dateKey)

  const result = await submitDailyGuess({
    mode: input.mode,
    taste: input.taste,
    guessId: input.guessId,
    hintsUsed: input.hintsUsed,
    idempotencyKey: `guess:${sessionKey}:${input.guessId}`,
  })

  if (!result.ok) {
    if (result.migrationMissing) {
      migrationMissingKeys.add(sessionKey)
      return { status: 'skipped', reason: 'migration_missing' }
    }
    return {
      status: 'error',
      warning: 'ranked_guess_failed',
      message: result.error,
    }
  }

  const guessIds = result.attempt?.guessIds ?? []
  const attemptStatus = result.attempt?.status ?? 'active'
  const dayStatus: 'playing' | 'won' | 'lost' =
    attemptStatus === 'won'
      ? 'won'
      : attemptStatus === 'lost' || attemptStatus === 'surrendered'
        ? 'lost'
        : 'playing'

  if (result.finalized && result.completion) {
    submittedKeys.add(rankedSubmissionKey(userId, input.mode, dateKey))
  }

  return {
    status: 'ok',
    correct: result.correct,
    accepted: result.accepted,
    finalized: result.finalized,
    guessIds,
    dayStatus,
    answerId: result.attempt?.answerId ?? result.completion?.answerId ?? null,
    characterId:
      result.attempt?.characterId ?? result.completion?.characterId ?? null,
    completion: result.completion,
  }
}

/**
 * Finalize a ranked attempt (surrender or explicit terminal).
 * Replaces forgeable complete_daily_mode* submission.
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
  const sessionKey = attemptSessionKey(userId, input.mode, dateKey)

  if (migrationMissingKeys.has(sessionKey)) {
    return { status: 'skipped', reason: 'migration_missing' }
  }
  if (submittedKeys.has(key)) {
    return { status: 'skipped', reason: 'duplicate' }
  }

  if (!MODES.includes(input.mode)) {
    return {
      status: 'error',
      warning: 'ranked_payload_invalid',
      message: `Invalid mode: ${input.mode}`,
    }
  }
  if (!TASTES.includes(input.taste)) {
    return {
      status: 'error',
      warning: 'ranked_payload_invalid',
      message: `Invalid taste: ${input.taste}`,
    }
  }

  // Ensure attempt exists (no-op if already started this session).
  const started = await ensureRankedAttemptStarted({
    userId,
    isPractice: input.isPractice,
    isArchive: input.isArchive,
    mode: input.mode,
    taste: input.taste,
    hardMode: input.hardMode,
    dateKey,
  })
  if (started.status === 'skipped') return started
  if (started.status === 'error') return started
  if (started.alreadyCompleted) {
    submittedKeys.add(key)
    return {
      status: 'ok',
      inserted: false,
      dateKey,
      mode: input.mode,
      taste: input.taste,
      outcome: 'lost',
      guessCount: input.guessIds.length,
      surrendered: input.surrendered,
      pointDelta: 0,
      playPointDelta: 0,
      pointsBalance: 0,
      answerId: started.answerId,
      characterId: null,
    }
  }

  submittedKeys.add(key)

  try {
    const result = await finalizeDailyAttempt({
      mode: input.mode,
      taste: input.taste,
      surrendered: input.surrendered,
      hintsUsed: input.hintsUsed,
      idempotencyKey: `finalize:${sessionKey}:${input.surrendered ? 'surrender' : 'end'}`,
    })

    if (!result.ok) {
      submittedKeys.delete(key)
      if (result.migrationMissing) {
        migrationMissingKeys.add(sessionKey)
        return { status: 'skipped', reason: 'migration_missing' }
      }
      return {
        status: 'error',
        warning: 'ranked_rpc_failed',
        message: result.error,
      }
    }

    if (result.completion) {
      return completionToOkResult(result.completion, {
        mode: input.mode,
        taste: input.taste,
        dateKey,
      })
    }

    const attempt = result.attempt
    const outcome: 'won' | 'lost' =
      attempt?.status === 'won' ? 'won' : 'lost'
    return {
      status: 'ok',
      inserted: false,
      dateKey: attempt?.dateKey || dateKey,
      mode: input.mode,
      taste: input.taste,
      outcome,
      guessCount: attempt?.guessCount ?? input.guessIds.length,
      surrendered: attempt?.status === 'surrendered' || input.surrendered,
      pointDelta: 0,
      playPointDelta: 0,
      pointsBalance: 0,
      answerId: attempt?.answerId ?? null,
      characterId: attempt?.characterId ?? null,
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
 * Server validates guessed character id / label — never a trusted boolean.
 */
export async function submitBonusNameReward(input: {
  userId: string | null | undefined
  isPractice: boolean
  isArchive: boolean
  mode: StatsModeId
  taste: ReaderTaste
  correct: boolean
  firstTry: boolean
  guessedCharacterId: number
  guessLabel?: string | null
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
  if (!Number.isInteger(input.guessedCharacterId) || input.guessedCharacterId <= 0) {
    return {
      status: 'error',
      warning: 'bonus_payload_invalid',
      message: 'Invalid guessed character id',
    }
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
      p_guessed_character_id: input.guessedCharacterId,
      p_guess_label: input.guessLabel ?? null,
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

    // Old boolean overload returns applied:false with this reason — treat as hard fail
    // so we never pretend the trusted-boolean path still awards.
    if (row.reason === 'deprecated_use_guess_payload') {
      bonusSubmittedKeys.delete(key)
      return {
        status: 'error',
        warning: 'bonus_rpc_deprecated',
        message: 'Bonus RPC requires guessed character payload',
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
      reason: typeof row.reason === 'string' ? row.reason : undefined,
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

function emitCompletionSideEffects(
  result: Extract<RankedSubmitResult, { status: 'ok' }>,
  input: {
    mode: StatsModeId
    surrendered: boolean
    dateKey?: string
  },
): void {
  if (!result.inserted || typeof window === 'undefined') return
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

/** Apply rewards from an auto-finalized guess completion. */
export function applyRankedCompletionReward(
  completion: DailyCompletionReward,
  opts: { surrendered?: boolean } = {},
): void {
  const result = completionToOkResult(completion, {
    mode: completion.mode,
    taste: completion.taste,
    dateKey: completion.dateKey,
  })
  emitCompletionSideEffects(result, {
    mode: completion.mode,
    surrendered: opts.surrendered ?? completion.surrendered,
    dateKey: completion.dateKey,
  })
}

/** Fire-and-forget helper that logs structured warnings without breaking local play. */
export function queueVerifiedDailyCompletion(
  input: Parameters<typeof submitVerifiedDailyCompletion>[0] & {
    onResult?: (result: RankedSubmitResult) => void
  },
): void {
  lastPointsAwarded = null
  lastPointsAwardedAt = 0
  void submitVerifiedDailyCompletion(input).then((result) => {
    input.onResult?.(result)
    if (result.status === 'error') {
      console.warn('[ranked]', result.warning, result.message)
      return
    }
    if (result.status === 'skipped' && result.reason === 'migration_missing') {
      console.warn(
        '[ranked]',
        'migration_missing',
        'Server attempt RPCs unavailable; ranked submission skipped (no forgeable fallback)',
      )
      return
    }
    if (result.status === 'ok') {
      emitCompletionSideEffects(result, {
        mode: input.mode,
        surrendered: input.surrendered,
        dateKey: input.dateKey,
      })
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

/** @deprecated Payload builder for legacy forgeable RPCs — kept for unit coverage of guards. */
export interface CompleteDailyModePayload {
  mode: StatsModeId
  taste: ReaderTaste
  guessIds: number[]
  hintsUsed: number
  hardMode: boolean
  surrendered: boolean
}

/**
 * Build / normalize a completion-shaped payload (client validation only).
 * Ranked submission no longer sends this to complete_daily_mode*.
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
