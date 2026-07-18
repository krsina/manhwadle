/**
 * Pure JS mirrors of leaderboard SQL streak helpers
 * (app_private.live_current_streak / compute_streak_from_dates + neutrals).
 * Keep semantics aligned with supabase/migrations/20260718060000_leaderboard_home_status.sql.
 */

/** @param {string} dateKey @param {number} deltaDays */
export function shiftUtcDateKey(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * @param {string} earlier
 * @param {string} later
 * @param {readonly string[]} neutralDates
 */
export function onlyNeutralBetween(earlier, later, neutralDates = []) {
  if (!earlier || !later || later <= earlier) return false
  const neutral = new Set(neutralDates)
  let cursor = shiftUtcDateKey(earlier, 1)
  while (cursor < later) {
    if (!neutral.has(cursor)) return false
    cursor = shiftUtcDateKey(cursor, 1)
  }
  return true
}

/**
 * @param {string | null | undefined} lastDateKey
 * @param {string} today
 * @param {readonly string[]} neutralDates
 */
export function isStreakCurrentlyActive(lastDateKey, today, neutralDates = []) {
  if (!lastDateKey) return false
  if (lastDateKey === today) return true
  const yesterday = shiftUtcDateKey(today, -1)
  if (lastDateKey === yesterday) return true
  if (
    lastDateKey < today &&
    onlyNeutralBetween(lastDateKey, today, neutralDates)
  ) {
    return true
  }
  return false
}

/**
 * Stored summaries may lag; public ranking must use this live gate.
 * @param {number} stored
 * @param {string | null | undefined} lastDateKey
 * @param {string} today
 * @param {readonly string[]} neutralDates
 */
export function liveCurrentStreak(
  stored,
  lastDateKey,
  today,
  neutralDates = [],
) {
  if (!isStreakCurrentlyActive(lastDateKey, today, neutralDates)) return 0
  return Math.max(stored ?? 0, 0)
}

/**
 * @param {Iterable<string>} dates
 * @param {string} today
 * @param {readonly string[]} neutralDates
 */
export function computeStreakFromDates(dates, today, neutralDates = []) {
  const set = [...new Set(dates)].sort()
  const neutral = new Set(neutralDates)
  if (set.length === 0) {
    return { currentStreak: 0, maxStreak: 0, lastDateKey: null }
  }

  const played = new Set(set)
  const lastDateKey = set[set.length - 1]

  let cursor =
    played.has(today) || neutral.has(today)
      ? today
      : shiftUtcDateKey(today, -1)

  let currentStreak = 0
  for (;;) {
    if (neutral.has(cursor)) {
      cursor = shiftUtcDateKey(cursor, -1)
      continue
    }
    if (played.has(cursor)) {
      currentStreak += 1
      cursor = shiftUtcDateKey(cursor, -1)
      continue
    }
    break
  }

  let maxStreak = 0
  let run = 0
  /** @type {string | null} */
  let prev = null
  for (const key of set) {
    if (prev == null) {
      run = 1
    } else if (
      key === shiftUtcDateKey(prev, 1) ||
      onlyNeutralBetween(prev, key, neutralDates)
    ) {
      run += 1
    } else {
      run = 1
    }
    maxStreak = Math.max(maxStreak, run)
    prev = key
  }

  return { currentStreak, maxStreak, lastDateKey }
}

/** Empty effective required set => neutral all-mode day (not all-complete). */
export function isNeutralAllModeDay(effectiveRequiredModes) {
  return !effectiveRequiredModes || effectiveRequiredModes.length === 0
}

export function isAllModeDayComplete(effectiveRequiredModes, completedModes) {
  if (isNeutralAllModeDay(effectiveRequiredModes)) return false
  const completed = new Set(completedModes)
  return effectiveRequiredModes.every((m) => completed.has(m))
}
