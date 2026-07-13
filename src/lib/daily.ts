import type { Manhwa } from './anilist-types'

/** UTC calendar date as YYYY-MM-DD */
export function getTodayKey(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export function getDailyIndex(dateKey: string, poolSize: number): number {
  if (poolSize <= 0) return 0
  return hashString(`manhwaguessr-${dateKey}`) % poolSize
}

export function getDailyAnswer(pool: Manhwa[], dateKey = getTodayKey()): Manhwa {
  const index = getDailyIndex(dateKey, pool.length)
  return pool[index]!
}

export function displayTitle(manhwa: Manhwa): string {
  return manhwa.title.english?.trim() || manhwa.title.romaji?.trim() || manhwa.title.native?.trim() || `Manhwa #${manhwa.id}`
}
