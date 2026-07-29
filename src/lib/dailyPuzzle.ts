import type { Manhwa } from './anilist-types'
import { getDailyAnswer, getTodayKey } from './daily'
import { fetchDailyPlayState, isMissingRpcError } from './dailyAttempt'
import { findById } from './search'
import { supabase, isSupabaseConfigured } from './supabase'
import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'

export interface DailyPuzzleRow {
  date_key: string
  mode: StatsModeId
  taste: ReaderTaste
  answer_id: number
  character_id: number | null
  meta: Record<string, unknown> | null
}

export type DailyPuzzleSource = 'remote' | 'local' | 'play_state'

export interface DailyPublicClue {
  type: StatsModeId
  [key: string]: unknown
}

export interface TodaysPuzzleResult {
  answer: Manhwa
  characterId: number | null
  source: DailyPuzzleSource
  /** True when today's answer_id is intentionally withheld (signed-in ranked path). */
  answerHidden: boolean
  meta: Record<string, unknown> | null
  clue: DailyPublicClue | null
  /** False means signed-in ranked play must fail closed. */
  rankedClueReady: boolean
  /** Set when the authoritative attempt flow RPC is missing on the backend. */
  migrationMissing?: boolean
}

function isPastDateKey(dateKey: string, todayKey = getTodayKey()): boolean {
  return dateKey < todayKey
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePublicPayload(
  mode: StatsModeId,
  meta: Record<string, unknown> | null,
): { clue: DailyPublicClue; fingerprint: Record<string, unknown> } | null {
  if (!meta || !isRecord(meta.clue) || !isRecord(meta.fingerprint)) return null
  const clue = meta.clue
  if (clue.type !== mode) return null
  const valid =
    (mode === 'summary' &&
      Array.isArray(clue.blurbs) &&
      clue.blurbs.some((value) => typeof value === 'string' && value.trim())) ||
    (mode === 'cover' &&
      typeof clue.image_url === 'string' &&
      Boolean(clue.image_url.trim())) ||
    (mode === 'character' &&
      typeof clue.image_url === 'string' &&
      Boolean(clue.image_url.trim())) ||
    (mode === 'heardle' &&
      typeof clue.youtube_id === 'string' &&
      Boolean(clue.youtube_id.trim()))
  if (!valid) return null
  return { clue: clue as DailyPublicClue, fingerprint: meta.fingerprint }
}

function fingerprintAnswer(
  fingerprint: Record<string, unknown>,
  clue: DailyPublicClue,
): Manhwa {
  return {
    id: 0,
    title: { english: null, romaji: null, native: null },
    synonyms: [],
    description:
      clue.type === 'summary' && Array.isArray(clue.blurbs)
        ? clue.blurbs.filter((value): value is string => typeof value === 'string').at(-1) ?? ''
        : '',
    genres: Array.isArray(fingerprint.genres)
      ? fingerprint.genres.filter((value): value is string => typeof value === 'string')
      : [],
    tags: Array.isArray(fingerprint.tags)
      ? fingerprint.tags.filter((value): value is string => typeof value === 'string')
      : [],
    status: typeof fingerprint.status === 'string' ? fingerprint.status : 'Unknown',
    publisher: typeof fingerprint.publisher === 'string' ? fingerprint.publisher : '',
    startDate: {
      year: typeof fingerprint.year === 'number' ? fingerprint.year : null,
      month: null,
      day: null,
    },
    coverImage:
      clue.type === 'cover' && typeof clue.image_url === 'string'
        ? clue.image_url
        : null,
    siteUrl: '',
    characters: [],
  }
}

function unavailableHiddenAnswer(): Manhwa {
  return {
    id: 0,
    title: { english: null, romaji: null, native: null },
    synonyms: [],
    description: '',
    genres: [],
    tags: [],
    status: 'Unknown',
    publisher: '',
    startDate: { year: null, month: null, day: null },
    coverImage: null,
    siteUrl: '',
    characters: [],
  }
}

function sortedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function sameStringList(left: unknown, right: unknown): boolean {
  const a = sortedStrings(left)
  const b = sortedStrings(right)
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

/**
 * Bind a clue-safe answer fingerprint to a catalog title when exactly one
 * playable entry matches. Lets guests (local guess validation) share the
 * server-selected daily without the RPC returning answer_id.
 */
export function resolveUniqueByFingerprint(
  pool: Manhwa[],
  fingerprint: Record<string, unknown>,
): Manhwa | null {
  const year = typeof fingerprint.year === 'number' ? fingerprint.year : null
  const status = typeof fingerprint.status === 'string' ? fingerprint.status : 'Unknown'
  const publisher =
    typeof fingerprint.publisher === 'string' ? fingerprint.publisher : ''

  const matches = pool.filter((manhwa) => {
    if ((manhwa.startDate?.year ?? null) !== year) return false
    if ((manhwa.status || 'Unknown') !== status) return false
    if ((manhwa.publisher || '') !== publisher) return false
    if (!sameStringList(manhwa.genres, fingerprint.genres)) return false
    if (!sameStringList(manhwa.tags, fingerprint.tags)) return false
    return true
  })

  return matches.length === 1 ? matches[0]! : null
}

/**
 * Fetch a past/archive puzzle row (answer_id allowed).
 * Current UTC day is never read from the table — use get_daily_play_state.
 */
export async function fetchDailyPuzzleRow(
  mode: StatsModeId,
  taste: ReaderTaste,
  dateKey = getTodayKey(),
): Promise<DailyPuzzleRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  // After hardening, RLS blocks today; do not attempt a forgeable today SELECT.
  if (!isPastDateKey(dateKey)) return null
  try {
    const { data, error } = await supabase
      .from('daily_puzzles')
      .select('date_key, mode, taste, answer_id, character_id, meta')
      .eq('date_key', dateKey)
      .eq('mode', mode)
      .eq('taste', taste)
      .maybeSingle()
    if (error || !data) return null
    return data as DailyPuzzleRow
  } catch {
    return null
  }
}

/**
 * Resolve today's (or archive) answer.
 *
 * - Archive (`dateKey < today`): remote SELECT may include answer_id.
 * - Today: `get_daily_play_state`. Guests receive top-level answer_id for
 *   local validation (Wordle-style). Authenticated callers omit answer_id
 *   until terminal; they bind via unique fingerprint when possible, else keep
 *   a stub for ranked UI (guesses still validate server-side).
 * - Migration missing: local FNV only for today (no today SELECT / no ranked).
 */
export async function getTodaysPuzzle(
  mode: StatsModeId,
  taste: ReaderTaste,
  playablePool: Manhwa[],
  fallbackPool: Manhwa[],
  seedPrefix: string,
  dateKey = getTodayKey(),
): Promise<TodaysPuzzleResult> {
  const pool = playablePool.length > 0 ? playablePool : fallbackPool
  const localAnswer = getDailyAnswer(pool, dateKey, seedPrefix)

  if (isPastDateKey(dateKey)) {
    const row = await fetchDailyPuzzleRow(mode, taste, dateKey)
    if (row) {
      const remote = findById(pool, row.answer_id)
      if (remote) {
        return {
          answer: remote,
          characterId: row.character_id,
          source: 'remote',
          answerHidden: false,
          meta: row.meta,
          clue: null,
          rankedClueReady: false,
        }
      }
    }
    return {
      answer: localAnswer,
      characterId: null,
      source: 'local',
      answerHidden: false,
      meta: null,
      clue: null,
      rankedClueReady: false,
    }
  }

  // Current day: play-state RPC (guest answer_id or authenticated clue-safe).
  const play = await fetchDailyPlayState(mode, taste)
  if (play.ok) {
    const payload = parsePublicPayload(mode, play.meta)
    const terminalAnswerId = play.attempt?.answerId ?? null
    if (terminalAnswerId != null) {
      const revealed = findById(pool, terminalAnswerId)
      if (revealed) {
        return {
          answer: revealed,
          characterId: play.attempt?.characterId ?? null,
          source: 'play_state',
          answerHidden: false,
          meta: play.meta,
          clue: payload?.clue ?? null,
          rankedClueReady: Boolean(payload),
        }
      }
    }

    // Anon/guest: server returns the live answer_id for local validation.
    if (play.answerId != null) {
      const guestAnswer = findById(pool, play.answerId)
      if (guestAnswer) {
        return {
          answer: guestAnswer,
          characterId: play.characterId,
          source: 'play_state',
          answerHidden: false,
          meta: play.meta,
          clue: payload?.clue ?? null,
          rankedClueReady: Boolean(payload),
        }
      }
    }

    if (payload) {
      const bound = resolveUniqueByFingerprint(pool, payload.fingerprint)
      if (bound) {
        return {
          answer: bound,
          characterId: null,
          source: 'play_state',
          answerHidden: false,
          meta: play.meta,
          clue: payload.clue,
          rankedClueReady: true,
        }
      }
      return {
        answer: fingerprintAnswer(payload.fingerprint, payload.clue),
        characterId: null,
        source: 'play_state',
        answerHidden: true,
        meta: play.meta,
        clue: payload.clue,
        rankedClueReady: true,
      }
    }

    return {
      answer: unavailableHiddenAnswer(),
      characterId: null,
      source: 'play_state',
      answerHidden: true,
      meta: play.meta,
      clue: null,
      rankedClueReady: false,
    }
  }

  if (play.migrationMissing || isMissingRpcError(play.error)) {
    return {
      answer: localAnswer,
      characterId: null,
      source: 'local',
      answerHidden: true,
      meta: null,
      clue: null,
      rankedClueReady: false,
      migrationMissing: true,
    }
  }

  return {
    answer: localAnswer,
    characterId: null,
    source: 'local',
    answerHidden: true,
    meta: null,
    clue: null,
    rankedClueReady: false,
  }
}

/**
 * Distinct past date_keys that have any puzzle for this taste
 * (across Summary / Character / Cover / Heardle). Today is excluded —
 * current answers are not readable via table SELECT after hardening.
 */
export async function fetchArchiveDateKeys(taste: ReaderTaste): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  try {
    const today = getTodayKey()
    const { data, error } = await supabase
      .from('daily_puzzles')
      .select('date_key')
      .eq('taste', taste)
      .lt('date_key', today)
      .order('date_key', { ascending: true })
    if (error || !data) return []
    const keys = new Set<string>()
    for (const row of data) {
      const key = (row as { date_key?: string }).date_key
      if (typeof key === 'string' && key) keys.add(key)
    }
    return [...keys]
  } catch {
    return []
  }
}
