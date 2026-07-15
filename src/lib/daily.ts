import type { Manhwa } from './anilist-types'

/** UTC calendar date as YYYY-MM-DD */
export function getTodayKey(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Milliseconds until the next UTC midnight (when the daily puzzle rolls). */
export function msUntilNextUtcMidnight(now = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )
  return Math.max(0, next - now.getTime())
}

/** Format a duration as H:MM:SS for countdown UI. */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Deterministic hash for daily puzzle seeding */
export function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getDailyIndex(
  dateKey: string,
  poolSize: number,
  seedPrefix: string,
): number {
  if (poolSize <= 0) return 0
  return hashString(`${seedPrefix}-${dateKey}`) % poolSize
}

export function getDailyAnswer(
  pool: Manhwa[],
  dateKey: string,
  seedPrefix: string,
): Manhwa {
  const index = getDailyIndex(dateKey, pool.length, seedPrefix)
  return pool[index]!
}

export function displayTitle(manhwa: Manhwa): string {
  return (
    manhwa.title.english?.trim() ||
    manhwa.title.romaji?.trim() ||
    manhwa.title.native?.trim() ||
    `Manhwa #${manhwa.id}`
  )
}
