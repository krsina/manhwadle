import type { ReaderTaste } from './readerTaste'
import { getTodayKey } from './daily'
import { getTastePlayStreak } from './streak'

export type StatsModeId = 'summary' | 'character' | 'cover' | 'heardle'

export interface ModeStats {
  played: number
  wins: number
  currentStreak: number
  maxStreak: number
  lastPlayedDateKey: string | null
  /** Index 0 = solved in 1 guess … length = maxGuesses */
  guessDistribution: number[]
  bonusAttempts?: number
  bonusCorrect?: number
  doubleSolves?: number
  /** UTC day the bonus was last recorded for this lane (idempotency) */
  lastBonusDateKey?: string | null
}

export interface StatsStore {
  version: 1
  /** Key: `${modeId}:${taste}` */
  lanes: Record<string, ModeStats>
}

const STORAGE_KEY = 'manhwadle:stats:v1'

export function statsLaneKey(modeId: StatsModeId, taste: ReaderTaste): string {
  return `${modeId}:${taste}`
}

function emptyModeStats(maxGuesses: number): ModeStats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDateKey: null,
    guessDistribution: Array.from({ length: maxGuesses }, () => 0),
    bonusAttempts: 0,
    bonusCorrect: 0,
    doubleSolves: 0,
    lastBonusDateKey: null,
  }
}

function previousUtcDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return getTodayKey(dt)
}

export function loadStatsStore(): StatsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, lanes: {} }
    const parsed = JSON.parse(raw) as StatsStore
    if (!parsed || parsed.version !== 1 || typeof parsed.lanes !== 'object') {
      return { version: 1, lanes: {} }
    }
    return parsed
  } catch {
    return { version: 1, lanes: {} }
  }
}

function saveStatsStore(store: StatsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

/** Persist a full stats store (used by cloud merge). */
export function saveStatsStoreExternal(store: StatsStore): void {
  saveStatsStore(store)
}

export function getModeStats(
  modeId: StatsModeId,
  taste: ReaderTaste,
  maxGuesses = 6,
): ModeStats {
  const store = loadStatsStore()
  const key = statsLaneKey(modeId, taste)
  const existing = store.lanes[key]
  if (!existing) return emptyModeStats(maxGuesses)

  const dist = [...(existing.guessDistribution || [])]
  while (dist.length < maxGuesses) dist.push(0)
  return {
    ...emptyModeStats(maxGuesses),
    ...existing,
    guessDistribution: dist.slice(0, maxGuesses),
  }
}

export const STATS_MODE_IDS: StatsModeId[] = [
  'summary',
  'character',
  'cover',
  'heardle',
]

/** Aggregate played/wins/distribution across modes for the same taste. */
export function combineModeStats(
  parts: ModeStats[],
  maxGuesses = 6,
): ModeStats {
  const combined = emptyModeStats(maxGuesses)

  for (const stats of parts) {
    combined.played += stats.played
    combined.wins += stats.wins
    combined.currentStreak = Math.max(combined.currentStreak, stats.currentStreak)
    combined.maxStreak = Math.max(combined.maxStreak, stats.maxStreak)
    combined.bonusAttempts =
      (combined.bonusAttempts ?? 0) + (stats.bonusAttempts ?? 0)
    combined.bonusCorrect =
      (combined.bonusCorrect ?? 0) + (stats.bonusCorrect ?? 0)
    combined.doubleSolves =
      (combined.doubleSolves ?? 0) + (stats.doubleSolves ?? 0)

    for (let i = 0; i < maxGuesses; i++) {
      combined.guessDistribution[i] += stats.guessDistribution[i] ?? 0
    }

    const lastPlayed = stats.lastPlayedDateKey
    if (
      lastPlayed &&
      (!combined.lastPlayedDateKey || lastPlayed > combined.lastPlayedDateKey)
    ) {
      combined.lastPlayedDateKey = lastPlayed
    }

    const lastBonus = stats.lastBonusDateKey
    if (
      lastBonus &&
      (!combined.lastBonusDateKey || lastBonus > combined.lastBonusDateKey)
    ) {
      combined.lastBonusDateKey = lastBonus
    }
  }

  return combined
}

/**
 * Sum stats for every mode under the active taste lane.
 * Streak uses any-mode play days (finish ≥1 mode), not per-mode win streaks.
 */
export function getCombinedStats(taste: ReaderTaste, maxGuesses = 6): ModeStats {
  const combined = combineModeStats(
    STATS_MODE_IDS.map((modeId) => getModeStats(modeId, taste, maxGuesses)),
    maxGuesses,
  )
  const playStreak = getTastePlayStreak(taste)
  return {
    ...combined,
    currentStreak: playStreak.currentStreak,
    maxStreak: playStreak.maxStreak,
    lastPlayedDateKey:
      playStreak.lastPlayedDateKey ?? combined.lastPlayedDateKey,
  }
}

export interface DailyResultInput {
  modeId: StatsModeId
  taste: ReaderTaste
  dateKey: string
  maxGuesses: number
  won: boolean
  guessCount: number
}

/** Record a finished daily round. Idempotent per dateKey (won/lost once). */
export function recordDailyResult(input: DailyResultInput): ModeStats {
  const store = loadStatsStore()
  const key = statsLaneKey(input.modeId, input.taste)
  const stats = getModeStats(input.modeId, input.taste, input.maxGuesses)

  // Already recorded this UTC day for this lane
  if (stats.lastPlayedDateKey === input.dateKey) {
    return stats
  }

  stats.played += 1

  if (input.won) {
    stats.wins += 1
    const bucket = Math.min(
      Math.max(0, input.guessCount - 1),
      input.maxGuesses - 1,
    )
    stats.guessDistribution[bucket] =
      (stats.guessDistribution[bucket] ?? 0) + 1

    const yesterday = previousUtcDateKey(input.dateKey)
    if (stats.lastPlayedDateKey === yesterday) {
      stats.currentStreak += 1
    } else {
      stats.currentStreak = 1
    }
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
  } else {
    stats.currentStreak = 0
  }

  stats.lastPlayedDateKey = input.dateKey
  store.lanes[key] = stats
  saveStatsStore(store)
  return stats
}

export interface BonusStatsInput {
  modeId: StatsModeId
  taste: ReaderTaste
  dateKey: string
  maxGuesses: number
  correct: boolean
  /** True only for first-try series win + correct character name */
  doubleSolve: boolean
}

/** Record a one-shot bonus name answer. Idempotent per dateKey. */
export function recordBonusResult(input: BonusStatsInput): ModeStats {
  const store = loadStatsStore()
  const key = statsLaneKey(input.modeId, input.taste)
  const stats = getModeStats(input.modeId, input.taste, input.maxGuesses)

  if (stats.lastBonusDateKey === input.dateKey) {
    return stats
  }

  stats.lastBonusDateKey = input.dateKey
  stats.bonusAttempts = (stats.bonusAttempts ?? 0) + 1
  if (input.correct) stats.bonusCorrect = (stats.bonusCorrect ?? 0) + 1
  if (input.correct && input.doubleSolve) {
    stats.doubleSolves = (stats.doubleSolves ?? 0) + 1
  }

  store.lanes[key] = stats
  saveStatsStore(store)
  return stats
}

export function winPercent(stats: ModeStats): number {
  if (stats.played === 0) return 0
  return Math.round((stats.wins / stats.played) * 100)
}
