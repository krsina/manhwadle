import type { Manhwa } from './anilist-types'
import { getDailyAnswer, getTodayKey } from './daily'
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

/** Fetch today's puzzle from Supabase; null if missing/unconfigured/error. */
export async function fetchDailyPuzzleRow(
  mode: StatsModeId,
  taste: ReaderTaste,
  dateKey = getTodayKey(),
): Promise<DailyPuzzleRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null
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
 * Resolve today's answer: prefer remote daily_puzzles, fall back to local FNV hash.
 */
export async function getTodaysPuzzle(
  mode: StatsModeId,
  taste: ReaderTaste,
  playablePool: Manhwa[],
  fallbackPool: Manhwa[],
  seedPrefix: string,
  dateKey = getTodayKey(),
): Promise<{ answer: Manhwa; characterId: number | null; source: 'remote' | 'local' }> {
  const pool = playablePool.length > 0 ? playablePool : fallbackPool
  const localAnswer = getDailyAnswer(pool, dateKey, seedPrefix)

  const row = await fetchDailyPuzzleRow(mode, taste, dateKey)
  if (row) {
    const remote = findById(fallbackPool, row.answer_id) || findById(pool, row.answer_id)
    if (remote) {
      return {
        answer: remote,
        characterId: row.character_id,
        source: 'remote',
      }
    }
  }

  return { answer: localAnswer, characterId: null, source: 'local' }
}
