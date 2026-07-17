import { useEffect, useMemo, useState } from 'react'
import type { Manhwa } from './anilist-types'
import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'
import { getDailyAnswer } from './daily'
import { getTodaysPuzzle } from './dailyPuzzle'

/**
 * Local FNV answer immediately, then hydrate from daily_puzzles when available.
 */
export function useDailyPuzzleAnswer(
  mode: StatsModeId,
  taste: ReaderTaste,
  playablePool: Manhwa[],
  fallbackPool: Manhwa[],
  seedPrefix: string,
  dateKey: string,
): { answer: Manhwa; source: 'remote' | 'local'; characterId: number | null } {
  const pool = playablePool.length > 0 ? playablePool : fallbackPool
  const localAnswer = useMemo(
    () => getDailyAnswer(pool, dateKey, seedPrefix),
    [pool, dateKey, seedPrefix],
  )

  const [answer, setAnswer] = useState(localAnswer)
  const [source, setSource] = useState<'remote' | 'local'>('local')
  const [characterId, setCharacterId] = useState<number | null>(null)

  useEffect(() => {
    setAnswer(localAnswer)
    setSource('local')
    setCharacterId(null)
  }, [localAnswer])

  useEffect(() => {
    let cancelled = false
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
    })
    return () => {
      cancelled = true
    }
  }, [mode, taste, playablePool, fallbackPool, seedPrefix, dateKey])

  return { answer, source, characterId }
}
