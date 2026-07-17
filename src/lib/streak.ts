import type { ArchiveCellStatus } from './archive'
import { ARCHIVE_MODE_LANES, isValidDateKey } from './archive'
import { getTodayKey } from './daily'
import type { ReaderTaste } from './readerTaste'
import { withTastePrefix } from './readerTaste'
import { loadDayState } from './storage'

/** How thoroughly a day was finished across modes. */
export type DayPlayLevel = 'none' | 'any' | 'all'

export interface PlayStreakStats {
  currentStreak: number
  maxStreak: number
  lastPlayedDateKey: string | null
}

export interface StreakRun {
  /** Inclusive 0-based column within a week row. */
  startCol: number
  /** Exclusive end column within a week row. */
  endCol: number
  level: 'any'
}

/** Shift a YYYY-MM-DD by `deltaDays` in UTC. */
export function shiftUtcDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return getTodayKey(dt)
}

export function isFinishedArchiveStatus(status: ArchiveCellStatus): boolean {
  return (
    status === 'won' ||
    status === 'first-try' ||
    status === 'lost' ||
    status === 'double-solve'
  )
}

/** Classify a day from per-mode archive statuses. */
export function dayPlayLevelFromStatuses(
  modeStatuses: readonly ArchiveCellStatus[],
): DayPlayLevel {
  if (modeStatuses.length === 0) return 'none'
  let finished = 0
  for (const status of modeStatuses) {
    if (isFinishedArchiveStatus(status)) finished += 1
  }
  if (finished === 0) return 'none'
  if (finished >= modeStatuses.length) return 'all'
  return 'any'
}

/**
 * Current streak ends on today if played, otherwise yesterday (Wordle-style grace).
 * Max streak is the longest consecutive run in `playedDateKeys`.
 */
export function computePlayStreak(
  playedDateKeys: Iterable<string>,
  todayKey = getTodayKey(),
): PlayStreakStats {
  const played = new Set<string>()
  for (const key of playedDateKeys) {
    if (isValidDateKey(key)) played.add(key)
  }

  let lastPlayedDateKey: string | null = null
  for (const key of played) {
    if (!lastPlayedDateKey || key > lastPlayedDateKey) lastPlayedDateKey = key
  }

  let currentStreak = 0
  let cursor =
    played.has(todayKey) ? todayKey : shiftUtcDateKey(todayKey, -1)
  while (played.has(cursor)) {
    currentStreak += 1
    cursor = shiftUtcDateKey(cursor, -1)
  }

  const sorted = [...played].sort()
  let maxStreak = 0
  let run = 0
  let prev: string | null = null
  for (const key of sorted) {
    if (prev && key === shiftUtcDateKey(prev, 1)) {
      run += 1
    } else {
      run = 1
    }
    maxStreak = Math.max(maxStreak, run)
    prev = key
  }

  return { currentStreak, maxStreak, lastPlayedDateKey }
}

/** Collect finished date keys for a taste from local day progress. */
export function collectTastePlayDays(taste: ReaderTaste): {
  any: Set<string>
  all: Set<string>
} {
  const finishedByDate = new Map<string, number>()

  if (typeof localStorage === 'undefined') {
    return { any: new Set(), all: new Set() }
  }

  const prefixes = ARCHIVE_MODE_LANES.map((lane) =>
    withTastePrefix(lane.storagePrefix, taste),
  )

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue

    for (const prefix of prefixes) {
      if (!key.startsWith(prefix)) continue
      const dateKey = key.slice(prefix.length)
      if (!isValidDateKey(dateKey)) continue
      const state = loadDayState(dateKey, prefix)
      if (state?.status !== 'won' && state?.status !== 'lost') continue
      finishedByDate.set(dateKey, (finishedByDate.get(dateKey) ?? 0) + 1)
      break
    }
  }

  const modeCount = ARCHIVE_MODE_LANES.length
  const any = new Set<string>()
  const all = new Set<string>()
  for (const [dateKey, count] of finishedByDate) {
    any.add(dateKey)
    if (count >= modeCount) all.add(dateKey)
  }
  return { any, all }
}

export function getTastePlayStreak(
  taste: ReaderTaste,
  todayKey = getTodayKey(),
): PlayStreakStats {
  return computePlayStreak(collectTastePlayDays(taste).any, todayKey)
}

/**
 * Build within-week ribbon runs for a flat calendar grid (pads + days).
 * Adjacent finished days in the same week row share one any-mode ribbon.
 * Full three-mode clears are represented by the day tile, not the ribbon.
 */
export function buildWeekStreakRuns(
  levels: readonly (DayPlayLevel | null)[],
): StreakRun[][] {
  const runs: StreakRun[][] = []

  for (let rowStart = 0; rowStart < levels.length; rowStart += 7) {
    const rowLevels = levels.slice(rowStart, rowStart + 7)
    while (rowLevels.length < 7) rowLevels.push(null)

    const weekRuns: StreakRun[] = []
    let col = 0
    while (col < 7) {
      const level = rowLevels[col]
      if (level !== 'any' && level !== 'all') {
        col += 1
        continue
      }
      const startCol = col
      col += 1
      while (col < 7) {
        const next = rowLevels[col]
        if (next !== 'any' && next !== 'all') break
        col += 1
      }
      const endCol = col
      // Only group when 2+ days connect in this week.
      if (endCol - startCol >= 2) {
        weekRuns.push({
          startCol,
          endCol,
          level: 'any',
        })
      }
    }
    runs.push(weekRuns)
  }

  return runs
}

export type StreakEdge = 'start' | 'middle' | 'end'

export interface CellStreakStyle {
  level: 'any'
  edge: StreakEdge
}

/** Per-cell streak edge info for connecting day tiles (no overlay element). */
export function annotateWeekStreakStyles(
  levels: readonly (DayPlayLevel | null)[],
): (CellStreakStyle | null)[] {
  const styles: (CellStreakStyle | null)[] = levels.map(() => null)
  const weekRuns = buildWeekStreakRuns(levels)

  weekRuns.forEach((runs, weekIndex) => {
    const rowStart = weekIndex * 7
    for (const run of runs) {
      for (let col = run.startCol; col < run.endCol; col++) {
        const edge: StreakEdge =
          col === run.startCol
            ? 'start'
            : col === run.endCol - 1
              ? 'end'
              : 'middle'
        styles[rowStart + col] = { level: run.level, edge }
      }
    }
  })

  return styles
}
