import type { DayState } from './anilist-types'
import type { ReaderTaste } from './readerTaste'
import {
  loadReaderTaste,
  saveReaderTaste,
  isReaderTaste,
} from './readerTaste'
import {
  getModeStats,
  loadStatsStore,
  saveStatsStoreExternal,
  statsLaneKey,
  type ModeStats,
  type StatsModeId,
} from './stats'
import { loadDayState, saveDayState } from './storage'
import { getTodayKey } from './daily'
import { supabase, isSupabaseConfigured } from './supabase'
import { characterModeMeta } from '../modes/character/config'
import { coverModeMeta } from '../modes/cover/config'
import { summaryModeMeta } from '../modes/summary/config'

const MODE_META: Record<
  StatsModeId,
  { storagePrefix: string; maxGuesses: number }
> = {
  summary: {
    storagePrefix: summaryModeMeta.storagePrefix,
    maxGuesses: summaryModeMeta.maxGuesses,
  },
  character: {
    storagePrefix: characterModeMeta.storagePrefix,
    maxGuesses: characterModeMeta.maxGuesses,
  },
  cover: {
    storagePrefix: coverModeMeta.storagePrefix,
    maxGuesses: coverModeMeta.maxGuesses,
  },
}

const TASTES: ReaderTaste[] = ['action', 'romance', 'both']
const MODES: StatsModeId[] = ['summary', 'character', 'cover']

function tasteStoragePrefix(mode: StatsModeId, taste: ReaderTaste): string {
  return `${MODE_META[mode].storagePrefix}:${taste}`
}

function dateKeyNewer(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b)
}

/** Merge two ModeStats lanes per plan rules. */
export function mergeModeStats(local: ModeStats, remote: ModeStats): ModeStats {
  const newer = dateKeyNewer(local.lastPlayedDateKey, remote.lastPlayedDateKey)
  const preferLocalCounters = newer > 0
  const preferRemoteCounters = newer < 0

  const maxGuesses = Math.max(
    local.guessDistribution.length,
    remote.guessDistribution.length,
    6,
  )
  const dist = Array.from({ length: maxGuesses }, (_, i) => {
    if (preferLocalCounters) return local.guessDistribution[i] ?? 0
    if (preferRemoteCounters) return remote.guessDistribution[i] ?? 0
    return Math.max(local.guessDistribution[i] ?? 0, remote.guessDistribution[i] ?? 0)
  })

  const pickCounter = (l: number, r: number) => {
    if (preferLocalCounters) return l
    if (preferRemoteCounters) return r
    return Math.max(l, r)
  }

  return {
    played: Math.max(local.played, remote.played),
    wins: Math.max(local.wins, remote.wins),
    maxStreak: Math.max(local.maxStreak, remote.maxStreak),
    currentStreak: pickCounter(local.currentStreak, remote.currentStreak),
    lastPlayedDateKey:
      dateKeyNewer(local.lastPlayedDateKey, remote.lastPlayedDateKey) >= 0
        ? local.lastPlayedDateKey
        : remote.lastPlayedDateKey,
    guessDistribution: dist,
    bonusAttempts: pickCounter(local.bonusAttempts ?? 0, remote.bonusAttempts ?? 0),
    bonusCorrect: pickCounter(local.bonusCorrect ?? 0, remote.bonusCorrect ?? 0),
    doubleSolves: pickCounter(local.doubleSolves ?? 0, remote.doubleSolves ?? 0),
    lastBonusDateKey:
      dateKeyNewer(local.lastBonusDateKey, remote.lastBonusDateKey) >= 0
        ? local.lastBonusDateKey ?? null
        : remote.lastBonusDateKey ?? null,
  }
}

/** Prefer finished rounds; otherwise the side with more guesses. */
export function mergeDayProgress(
  local: DayState | null,
  remote: DayState | null,
): DayState | null {
  if (!local) return remote
  if (!remote) return local
  const localDone = local.status === 'won' || local.status === 'lost'
  const remoteDone = remote.status === 'won' || remote.status === 'lost'
  if (localDone && !remoteDone) return local
  if (remoteDone && !localDone) return remote
  if (local.guessIds.length !== remote.guessIds.length) {
    return local.guessIds.length >= remote.guessIds.length ? local : remote
  }
  return local
}

function rowToModeStats(row: Record<string, unknown>, maxGuesses: number): ModeStats {
  const dist = Array.isArray(row.guess_distribution)
    ? (row.guess_distribution as number[])
    : []
  while (dist.length < maxGuesses) dist.push(0)
  return {
    played: Number(row.played) || 0,
    wins: Number(row.wins) || 0,
    currentStreak: Number(row.current_streak) || 0,
    maxStreak: Number(row.max_streak) || 0,
    lastPlayedDateKey: (row.last_played_date_key as string) || null,
    guessDistribution: dist.slice(0, maxGuesses),
    bonusAttempts: Number(row.bonus_attempts) || 0,
    bonusCorrect: Number(row.bonus_correct) || 0,
    doubleSolves: Number(row.double_solves) || 0,
    lastBonusDateKey: (row.last_bonus_date_key as string) || null,
  }
}

function modeStatsToRow(userId: string, mode: StatsModeId, taste: ReaderTaste, stats: ModeStats) {
  return {
    user_id: userId,
    mode,
    taste,
    played: stats.played,
    wins: stats.wins,
    current_streak: stats.currentStreak,
    max_streak: stats.maxStreak,
    last_played_date_key: stats.lastPlayedDateKey,
    guess_distribution: stats.guessDistribution,
    bonus_attempts: stats.bonusAttempts ?? 0,
    bonus_correct: stats.bonusCorrect ?? 0,
    double_solves: stats.doubleSolves ?? 0,
    last_bonus_date_key: stats.lastBonusDateKey ?? null,
  }
}

function isRetryableSyncError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  )
}

async function withOneRetry(
  label: string,
  run: () => Promise<{ error: { message?: string; code?: string } | null }>,
): Promise<void> {
  const first = await run()
  if (!first.error) return
  if (isRetryableSyncError(first.error)) {
    const second = await run()
    if (!second.error) return
    console.warn(`[sync] ${label} failed after retry:`, second.error.message)
    return
  }
  console.warn(`[sync] ${label} failed:`, first.error.message)
}

export async function pushModeStats(
  userId: string,
  mode: StatsModeId,
  taste: ReaderTaste,
): Promise<void> {
  if (!supabase) return
  const stats = getModeStats(mode, taste, MODE_META[mode].maxGuesses)
  const row = modeStatsToRow(userId, mode, taste, stats)
  await withOneRetry(`player_stats ${mode}/${taste}`, async () =>
    supabase!.from('player_stats').upsert(row, { onConflict: 'user_id,mode,taste' }),
  )
}

export async function pushDayProgress(
  userId: string,
  mode: StatsModeId,
  taste: ReaderTaste,
  state: DayState,
): Promise<void> {
  if (!supabase) return
  const row = {
    user_id: userId,
    mode,
    taste,
    date_key: state.dateKey,
    guess_ids: state.guessIds,
    status: state.status,
    bonus_name_guess: state.bonusNameGuess ?? null,
    bonus_name_correct: state.bonusNameCorrect ?? null,
    answer_id: state.answerId,
  }
  await withOneRetry(`day_progress ${mode}/${taste}/${state.dateKey}`, async () =>
    supabase!
      .from('day_progress')
      .upsert(row, { onConflict: 'user_id,mode,taste,date_key' }),
  )
}

export async function pushReaderTaste(userId: string, taste: ReaderTaste): Promise<void> {
  if (!supabase) return
  await withOneRetry('profiles reader_taste', async () =>
    supabase!.from('profiles').upsert(
      { user_id: userId, reader_taste: taste },
      { onConflict: 'user_id' },
    ),
  )
}

/**
 * On sign-in: merge local ↔ remote stats/progress/taste, write both ways.
 * Returns the taste that should be active after merge (if any).
 */
export async function mergeLocalAndRemoteOnSignIn(
  userId: string,
): Promise<ReaderTaste | null> {
  if (!isSupabaseConfigured() || !supabase) return loadReaderTaste()

  const localTaste = loadReaderTaste()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('reader_taste')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileError) {
    console.warn('[sync] profiles read failed:', profileError.message)
  }

  const remoteTasteRaw = profile?.reader_taste
  const remoteTaste =
    typeof remoteTasteRaw === 'string' && isReaderTaste(remoteTasteRaw)
      ? remoteTasteRaw
      : null

  const mergedTaste = remoteTaste ?? localTaste
  if (mergedTaste) {
    saveReaderTaste(mergedTaste)
    if (!remoteTaste || remoteTaste !== mergedTaste) {
      await pushReaderTaste(userId, mergedTaste)
    }
  }

  const { data: remoteStats, error: statsError } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
  if (statsError) {
    console.warn('[sync] player_stats read failed:', statsError.message)
  }

  const store = loadStatsStore()
  const remoteByKey = new Map<string, ModeStats>()
  for (const row of remoteStats || []) {
    const mode = row.mode as StatsModeId
    const taste = row.taste as ReaderTaste
    if (!MODES.includes(mode) || !TASTES.includes(taste)) continue
    remoteByKey.set(
      statsLaneKey(mode, taste),
      rowToModeStats(row, MODE_META[mode].maxGuesses),
    )
  }

  const upsertRows: ReturnType<typeof modeStatsToRow>[] = []
  for (const mode of MODES) {
    for (const taste of TASTES) {
      const key = statsLaneKey(mode, taste)
      const local = store.lanes[key] || getModeStats(mode, taste, MODE_META[mode].maxGuesses)
      const remote = remoteByKey.get(key)
      const merged = remote ? mergeModeStats(local, remote) : local
      store.lanes[key] = merged
      upsertRows.push(modeStatsToRow(userId, mode, taste, merged))
    }
  }
  saveStatsStoreExternal(store)
  if (upsertRows.length > 0) {
    await withOneRetry('player_stats merge upsert', async () =>
      supabase!
        .from('player_stats')
        .upsert(upsertRows, { onConflict: 'user_id,mode,taste' }),
    )
  }

  const dateKey = getTodayKey()
  const { data: remoteDays, error: daysError } = await supabase
    .from('day_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('date_key', dateKey)
  if (daysError) {
    console.warn('[sync] day_progress read failed:', daysError.message)
  }

  for (const mode of MODES) {
    for (const taste of TASTES) {
      const prefix = tasteStoragePrefix(mode, taste)
      const local = loadDayState(dateKey, prefix)
      const remoteRow = (remoteDays || []).find(
        (r) => r.mode === mode && r.taste === taste,
      )
      const remote: DayState | null = remoteRow
        ? {
            dateKey,
            answerId: Number(remoteRow.answer_id) || 0,
            guessIds: Array.isArray(remoteRow.guess_ids)
              ? (remoteRow.guess_ids as number[])
              : [],
            status: remoteRow.status as DayState['status'],
            bonusNameGuess: remoteRow.bonus_name_guess ?? undefined,
            bonusNameCorrect:
              remoteRow.bonus_name_correct == null
                ? undefined
                : Boolean(remoteRow.bonus_name_correct),
          }
        : null

      const merged = mergeDayProgress(local, remote)
      if (!merged || !merged.answerId) continue
      saveDayState(merged, prefix)
      await pushDayProgress(userId, mode, taste, merged)
    }
  }

  return mergedTaste
}

/** Fire-and-forget sync helpers for gameplay writes. */
export function syncAfterLocalChange(userId: string | null | undefined): {
  stats: (mode: StatsModeId, taste: ReaderTaste) => void
  progress: (mode: StatsModeId, taste: ReaderTaste, state: DayState) => void
  taste: (taste: ReaderTaste) => void
} {
  const noop = {
    stats: () => {},
    progress: () => {},
    taste: () => {},
  }
  if (!userId || !supabase) return noop
  return {
    stats: (mode, taste) => {
      void pushModeStats(userId, mode, taste)
    },
    progress: (mode, taste, state) => {
      void pushDayProgress(userId, mode, taste, state)
    },
    taste: (t) => {
      void pushReaderTaste(userId, t)
    },
  }
}
