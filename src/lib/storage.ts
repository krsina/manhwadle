import type { DayState } from './anilist-types'

const STORAGE_PREFIX = 'manhwaguessr-day-'

export function loadDayState(dateKey: string): DayState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + dateKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DayState
    if (
      !parsed ||
      parsed.dateKey !== dateKey ||
      typeof parsed.answerId !== 'number' ||
      !Array.isArray(parsed.guessIds)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveDayState(state: DayState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + state.dateKey, JSON.stringify(state))
  } catch {
    // Ignore quota / private mode failures
  }
}

export function createInitialState(dateKey: string, answerId: number): DayState {
  return {
    dateKey,
    answerId,
    guessIds: [],
    status: 'playing',
  }
}
