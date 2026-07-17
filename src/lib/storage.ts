import type { DayState } from './anilist-types'

export function loadDayState(
  dateKey: string,
  storagePrefix: string,
): DayState | null {
  try {
    const raw = localStorage.getItem(storagePrefix + dateKey)
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

export function saveDayState(state: DayState, storagePrefix: string): void {
  try {
    localStorage.setItem(storagePrefix + state.dateKey, JSON.stringify(state))
  } catch {
    // Ignore quota / private mode failures
  }
}

export function createInitialState(
  dateKey: string,
  answerId: number,
  options?: { hardMode?: boolean },
): DayState {
  return {
    dateKey,
    answerId,
    guessIds: [],
    status: 'playing',
    ...(options?.hardMode != null ? { hardMode: options.hardMode } : {}),
  }
}
