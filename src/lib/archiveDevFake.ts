import { isOwnerDevSessionActive } from './devAccess'
import type { DayState } from './anilist-types'
import { ARCHIVE_MODE_LANES } from './archive'
import type { ReaderTaste } from './readerTaste'
import { withTastePrefix } from './readerTaste'
import { loadDayState, saveDayState } from './storage'

export type ArchiveModeId = (typeof ARCHIVE_MODE_LANES)[number]['id']

/** Per-mode outcomes the calendar can show. */
export type FakeModeOutcome =
  | 'clear'
  | 'available'
  | 'playing'
  | 'won'
  | 'first-try'
  | 'lost'
  | 'double-solve'

export const FAKE_MODE_OUTCOMES: { id: FakeModeOutcome; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'available', label: 'Available' },
  { id: 'playing', label: 'Playing' },
  { id: 'won', label: 'Won' },
  { id: 'first-try', label: 'First try solve' },
  { id: 'lost', label: 'Lost' },
  { id: 'double-solve', label: 'Double solve' },
]

const DEV_FORCE_KEY = 'manhwadle:dev:archive-force:'

function forceKey(taste: ReaderTaste): string {
  return `${DEV_FORCE_KEY}${taste}`
}

/** Dates forced playable in DEV even with no remote puzzle row. */
export function loadDevForcedDates(taste: ReaderTaste): Set<string> {
  if (
    !import.meta.env.DEV ||
    !isOwnerDevSessionActive() ||
    typeof localStorage === 'undefined'
  ) {
    return new Set()
  }
  try {
    const raw = localStorage.getItem(forceKey(taste))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

export function saveDevForcedDates(taste: ReaderTaste, dates: Set<string>): void {
  if (
    !import.meta.env.DEV ||
    !isOwnerDevSessionActive() ||
    typeof localStorage === 'undefined'
  ) {
    return
  }
  try {
    localStorage.setItem(forceKey(taste), JSON.stringify([...dates].sort()))
  } catch {
    /* ignore */
  }
}

function modeStorage(modeId: ArchiveModeId, taste: ReaderTaste): string {
  const lane = ARCHIVE_MODE_LANES.find((item) => item.id === modeId)!
  return withTastePrefix(lane.storagePrefix, taste)
}

function buildFakeState(
  dateKey: string,
  outcome: FakeModeOutcome,
): DayState | null {
  switch (outcome) {
    case 'clear':
    case 'available':
      return null
    case 'playing':
      return {
        dateKey,
        answerId: 900001,
        guessIds: [900002],
        status: 'playing',
      }
    case 'won':
      return {
        dateKey,
        answerId: 900001,
        guessIds: [900002, 900001],
        status: 'won',
      }
    case 'first-try':
      return {
        dateKey,
        answerId: 900001,
        guessIds: [900001],
        status: 'won',
      }
    case 'lost':
      return {
        dateKey,
        answerId: 900001,
        guessIds: [900002, 900003, 900004, 900005, 900006, 900007],
        status: 'lost',
      }
    case 'double-solve':
      return {
        dateKey,
        answerId: 900001,
        guessIds: [900001],
        status: 'won',
        bonusNameGuess: 'Dev Hero',
        bonusNameCorrect: true,
      }
  }
}

function clearModeDay(dateKey: string, storagePrefix: string): void {
  try {
    localStorage.removeItem(storagePrefix + dateKey)
  } catch {
    /* ignore */
  }
}

/** Write / clear local day progress for one date × mode. */
export function applyFakeModeOutcome(
  dateKey: string,
  taste: ReaderTaste,
  modeId: ArchiveModeId,
  outcome: FakeModeOutcome,
): void {
  if (!import.meta.env.DEV || !isOwnerDevSessionActive()) return
  const storage = modeStorage(modeId, taste)
  const next = buildFakeState(dateKey, outcome)
  if (!next) {
    clearModeDay(dateKey, storage)
    return
  }
  saveDayState(next, storage)
}

export function applyFakeDayOutcomes(
  dateKey: string,
  taste: ReaderTaste,
  outcomes: Partial<Record<ArchiveModeId, FakeModeOutcome>>,
): void {
  for (const lane of ARCHIVE_MODE_LANES) {
    const outcome = outcomes[lane.id]
    if (!outcome) continue
    applyFakeModeOutcome(dateKey, taste, lane.id, outcome)
  }

  const forced = loadDevForcedDates(taste)
  const stillHasState = ARCHIVE_MODE_LANES.some((lane) =>
    Boolean(loadDayState(dateKey, modeStorage(lane.id, taste))),
  )
  const keepPlayable = Object.values(outcomes).some(
    (o) => o != null && o !== 'clear',
  )

  if (stillHasState || keepPlayable) forced.add(dateKey)
  else forced.delete(dateKey)

  saveDevForcedDates(taste, forced)
}

/** Wipe all three modes for a date and un-force it. */
export function clearFakeDay(dateKey: string, taste: ReaderTaste): void {
  if (!import.meta.env.DEV || !isOwnerDevSessionActive()) return
  for (const lane of ARCHIVE_MODE_LANES) {
    clearModeDay(dateKey, modeStorage(lane.id, taste))
  }
  const forced = loadDevForcedDates(taste)
  forced.delete(dateKey)
  saveDevForcedDates(taste, forced)
}
