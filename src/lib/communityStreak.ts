import { isValidDateKey } from './archive'
import { getTodayKey } from './daily'
import { computePlayStreak, shiftUtcDateKey, type PlayStreakStats } from './streak'

/**
 * Server-aligned community streak helpers (UTC, completions-based).
 * Archive/practice are excluded by only feeding production daily completion dates.
 */

export type CommunityDayKind = 'any' | 'all'

export interface CommunityStreakStats extends PlayStreakStats {
  kind: CommunityDayKind
}

/**
 * Current streak uses today if present, else yesterday (grace).
 * Max is the longest consecutive UTC run.
 */
export function computeCommunityStreak(
  playedDateKeys: Iterable<string>,
  kind: CommunityDayKind,
  todayKey = getTodayKey(),
): CommunityStreakStats {
  const base = computePlayStreak(playedDateKeys, todayKey)
  return { ...base, kind }
}

/** Dates on or after the leaderboard epoch (production launch). */
export function filterFromEpoch(
  dateKeys: Iterable<string>,
  epochDateKey: string,
): string[] {
  const out: string[] = []
  for (const key of dateKeys) {
    if (!isValidDateKey(key)) continue
    if (key < epochDateKey) continue
    out.push(key)
  }
  return out
}

/**
 * A date counts for all-mode when every required mode (minus exemptions) is completed.
 * Completions count regardless of win/loss/surrender.
 */
export function isAllModeDayComplete(input: {
  requiredModes: readonly string[]
  completedModes: readonly string[]
  exemptModes?: readonly string[]
}): boolean {
  const exempt = new Set(input.exemptModes ?? [])
  const completed = new Set(input.completedModes)
  const required = input.requiredModes.filter((m) => !exempt.has(m))
  if (required.length === 0) return false
  return required.every((m) => completed.has(m))
}

/** True when at least one mode was completed that UTC day. */
export function isAnyModeDayComplete(completedModes: readonly string[]): boolean {
  return completedModes.length > 0
}

/**
 * Recompute both streak lanes from day activity maps.
 * `anyDays` / `allDays` should already be epoch-filtered.
 */
export function summarizeCommunityStreaks(input: {
  anyDays: Iterable<string>
  allDays: Iterable<string>
  todayKey?: string
}): {
  any: CommunityStreakStats
  all: CommunityStreakStats
} {
  const todayKey = input.todayKey ?? getTodayKey()
  return {
    any: computeCommunityStreak(input.anyDays, 'any', todayKey),
    all: computeCommunityStreak(input.allDays, 'all', todayKey),
  }
}

/** Detect a UTC gap (missing calendar day) between sorted ascending keys. */
export function hasUtcGap(sortedDateKeys: readonly string[]): boolean {
  for (let i = 1; i < sortedDateKeys.length; i++) {
    const prev = sortedDateKeys[i - 1]!
    const curr = sortedDateKeys[i]!
    if (curr !== shiftUtcDateKey(prev, 1)) return true
  }
  return false
}
