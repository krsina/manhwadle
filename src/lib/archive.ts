import type { DayState } from './anilist-types'
import { getTodayKey } from './daily'

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True when `value` is a real UTC calendar date as YYYY-MM-DD. */
export function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  )
}

/** Normalize a candidate date string; null if invalid. */
export function parseDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return isValidDateKey(trimmed) ? trimmed : null
}

/** Past UTC day relative to today (today itself is not archive). */
export function isArchiveDate(dateKey: string, todayKey = getTodayKey()): boolean {
  return isValidDateKey(dateKey) && dateKey < todayKey
}

export function readDateKeyFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): string | null {
  const params = new URLSearchParams(search)
  return parseDateKey(params.get('date'))
}

/**
 * Set or clear `?date=` on the current URL.
 * Omits the param when `dateKey` is today (or null) so the daily URL stays clean.
 */
export function writeDateKeyToUrl(dateKey: string | null, todayKey = getTodayKey()): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!dateKey || dateKey === todayKey) {
    url.searchParams.delete('date')
  } else {
    url.searchParams.set('date', dateKey)
  }
  window.history.replaceState({}, '', url)
}

export type ArchiveCellStatus =
  | 'unavailable'
  | 'available'
  | 'playing'
  | 'won'
  | 'first-try'
  | 'double-solve'
  | 'lost'

/** Fixed mode order for calendar dots: Summary · Character · Cover · Heardle */
export const ARCHIVE_MODE_LANES = [
  { id: 'summary' as const, label: 'Summary', storagePrefix: 'manhwadle:summary:day:' },
  { id: 'character' as const, label: 'Character', storagePrefix: 'manhwadle:character:day:' },
  { id: 'cover' as const, label: 'Cover', storagePrefix: 'manhwadle:cover:day:' },
  { id: 'heardle' as const, label: 'Heardle', storagePrefix: 'manhwadle:heardle:day:' },
]

/** First-try series win + correct bonus name. */
export function isDoubleSolveDayState(dayState: DayState | null | undefined): boolean {
  return (
    isFirstTryDayState(dayState) &&
    dayState?.bonusNameCorrect === true
  )
}

/**
 * Opening-guess win with no free hints.
 * First-try solves are strictly as-is — Reveal more gives up the badge.
 */
export function isFirstTrySolve(input: {
  won: boolean
  guessCount: number
  hintsUsed?: number
}): boolean {
  return (
    input.won &&
    input.guessCount === 1 &&
    (input.hintsUsed ?? 0) === 0
  )
}

/** Series solved on the opening guess with no hints, whether or not the bonus was correct. */
export function isFirstTryDayState(dayState: DayState | null | undefined): boolean {
  return isFirstTrySolve({
    won: dayState?.status === 'won',
    guessCount: dayState?.guessIds.length ?? 0,
    hintsUsed: dayState?.hintsUsed,
  })
}

/** Calendar cell status from puzzle availability + optional local DayState. */
export function getArchiveCellStatus(
  hasPuzzle: boolean,
  dayState: DayState | null,
): ArchiveCellStatus {
  if (!hasPuzzle) return 'unavailable'
  if (!dayState) return 'available'
  if (isDoubleSolveDayState(dayState)) return 'double-solve'
  if (isFirstTryDayState(dayState)) return 'first-try'
  if (dayState.status === 'won') return 'won'
  if (dayState.status === 'lost') return 'lost'
  if (dayState.guessIds.length > 0) return 'playing'
  return 'available'
}

export function statusLabel(status: ArchiveCellStatus): string {
  switch (status) {
    case 'double-solve':
      return 'double solve'
    case 'first-try':
      return 'first try solve'
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'playing':
      return 'in progress'
    case 'available':
      return 'available'
    default:
      return 'unavailable'
  }
}

/** True when a mode finished as a win (including first-try / double-solve). */
export function isSolvedArchiveStatus(status: ArchiveCellStatus): boolean {
  return status === 'won' || status === 'first-try' || status === 'double-solve'
}

/** All modes on the day were solved (won / first-try / double-solve). */
export function hasTripleSolveStatuses(
  modeStatuses: readonly ArchiveCellStatus[],
): boolean {
  return (
    modeStatuses.length > 0 && modeStatuses.every((status) => isSolvedArchiveStatus(status))
  )
}

/** Build YYYY-MM-DD for a UTC year/month/day. */
export function toDateKey(year: number, monthIndex: number, day: number): string {
  const y = String(year)
  const m = String(monthIndex + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKeyParts(dateKey: string): {
  year: number
  monthIndex: number
  day: number
} | null {
  if (!isValidDateKey(dateKey)) return null
  const [y, m, d] = dateKey.split('-').map(Number)
  return { year: y!, monthIndex: m! - 1, day: d! }
}

/** Days in a UTC month (monthIndex 0–11). */
export function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Weekday of the 1st of the month (0 = Sunday, UTC). */
export function utcMonthStartWeekday(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
}
