import { getTodayKey } from './daily'
import type { ReaderTaste } from './readerTaste'
import { withTastePrefix } from './readerTaste'
import { loadDayState } from './storage'
import { listDailyModes, listModes } from '../modes'

export type ModeCompletionStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'unavailable'

export interface ModeRowStatus {
  modeId: string
  status: ModeCompletionStatus
  source: 'server' | 'local' | 'none'
}

/** Local day status for guests / fallback when server completions are unavailable. */
export function localModeCompletionStatus(
  modeId: string,
  taste: ReaderTaste | null,
  dateKey = getTodayKey(),
): ModeCompletionStatus {
  const mode = listModes().find((m) => m.id === modeId)
  if (!mode) return 'unavailable'
  if (!taste) return 'not_started'
  const prefix = withTastePrefix(mode.storagePrefix, taste)
  const state = loadDayState(dateKey, prefix)
  if (!state) return 'not_started'
  if (state.status === 'won' || state.status === 'lost') return 'completed'
  if (state.status === 'playing') return 'in_progress'
  return 'not_started'
}

export function buildModeRowStatuses(input: {
  taste: ReaderTaste | null
  serverModes?: readonly string[] | null
  unavailableModes?: ReadonlySet<string> | readonly string[]
  dateKey?: string
}): ModeRowStatus[] {
  const unavailable = new Set(
    Array.isArray(input.unavailableModes)
      ? input.unavailableModes
      : [...(input.unavailableModes ?? [])],
  )
  const serverSet = input.serverModes ? new Set(input.serverModes) : null
  const dateKey = input.dateKey ?? getTodayKey()

  return listModes().map((mode) => {
    if (unavailable.has(mode.id)) {
      return { modeId: mode.id, status: 'unavailable', source: 'none' }
    }
    if (serverSet) {
      return {
        modeId: mode.id,
        status: serverSet.has(mode.id) ? 'completed' : 'not_started',
        source: 'server',
      }
    }
    return {
      modeId: mode.id,
      status: localModeCompletionStatus(mode.id, input.taste, dateKey),
      source: input.taste ? 'local' : 'none',
    }
  })
}

/** Finished dailies for today, including a mode that just closed its result sheet. */
export function completedDailyModeIds(input: {
  taste: ReaderTaste | null
  dateKey?: string
  includeModeId?: string
}): string[] {
  const dateKey = input.dateKey ?? getTodayKey()
  const include = input.includeModeId
  return listDailyModes()
    .filter((mode) => {
      if (include && mode.id === include) return true
      return localModeCompletionStatus(mode.id, input.taste, dateKey) === 'completed'
    })
    .map((mode) => mode.id)
}

export function statusLabel(status: ModeCompletionStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'in_progress':
      return 'In progress'
    case 'unavailable':
      return 'Unavailable'
    default:
      return 'Not started'
  }
}
