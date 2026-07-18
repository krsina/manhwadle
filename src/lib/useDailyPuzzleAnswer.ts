import { useEffect, useMemo, useState } from 'react'
import type { Manhwa } from './anilist-types'
import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'
import { getDailyAnswer } from './daily'
import { getTodaysPuzzle } from './dailyPuzzle'
import { isSupabaseConfigured } from './supabase'

export type DailyAnswerSource = 'remote' | 'local'

export interface DailyPuzzleAnswerState {
  answer: Manhwa
  source: DailyAnswerSource
  characterId: number | null
  /**
   * False while a remote daily_puzzles lookup is in flight (Supabase configured).
   * Unconfigured / anonymous-local settles immediately.
   */
  settled: boolean
}

/**
 * Resolve today's answer. With Supabase configured, stays unsettled until the
 * remote lookup finishes (miss/error settles to local FNV fallback). Without
 * Supabase, settles immediately on the local answer.
 */
export function useDailyPuzzleAnswer(
  mode: StatsModeId,
  taste: ReaderTaste,
  playablePool: Manhwa[],
  fallbackPool: Manhwa[],
  seedPrefix: string,
  dateKey: string,
): DailyPuzzleAnswerState {
  const pool = playablePool.length > 0 ? playablePool : fallbackPool
  const localAnswer = useMemo(
    () => getDailyAnswer(pool, dateKey, seedPrefix),
    [pool, dateKey, seedPrefix],
  )
  const configured = isSupabaseConfigured()

  const [answer, setAnswer] = useState(localAnswer)
  const [source, setSource] = useState<DailyAnswerSource>('local')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [settled, setSettled] = useState(!configured)

  useEffect(() => {
    if (!configured) {
      setAnswer(localAnswer)
      setSource('local')
      setCharacterId(null)
      setSettled(true)
      return
    }
    // Pending remote resolution — keep showing local as a placeholder only.
    setAnswer(localAnswer)
    setSource('local')
    setCharacterId(null)
    setSettled(false)
  }, [localAnswer, configured])

  useEffect(() => {
    if (!configured) return

    let cancelled = false
    setSettled(false)
    void getTodaysPuzzle(
      mode,
      taste,
      playablePool,
      fallbackPool,
      seedPrefix,
      dateKey,
    ).then((result) => {
      if (cancelled) return
      setAnswer(result.answer)
      setSource(result.source)
      setCharacterId(result.characterId)
      setSettled(true)
    })
    return () => {
      cancelled = true
    }
  }, [configured, mode, taste, playablePool, fallbackPool, seedPrefix, dateKey])

  return { answer, source, characterId, settled }
}
