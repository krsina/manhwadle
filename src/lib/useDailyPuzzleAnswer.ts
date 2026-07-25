import { useEffect, useMemo, useState } from 'react'
import type { Manhwa } from './anilist-types'
import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'
import { getDailyAnswer, getTodayKey } from './daily'
import {
  getTodaysPuzzle,
  type DailyPublicClue,
  type DailyPuzzleSource,
} from './dailyPuzzle'
import { isSupabaseConfigured } from './supabase'

export type DailyAnswerSource = DailyPuzzleSource

export interface DailyPuzzleAnswerState {
  answer: Manhwa
  source: DailyAnswerSource
  characterId: number | null
  meta: Record<string, unknown> | null
  clue: DailyPublicClue | null
  rankedClueReady: boolean
  /** True while today's answer_id is withheld from the client. */
  answerHidden: boolean
  /** True when attempt RPCs are missing — ranked play must stay local/unranked. */
  migrationMissing: boolean
  /**
   * False while a remote daily play-state / archive lookup is in flight.
   * Unconfigured settles immediately.
   */
  settled: boolean
}

/**
 * Resolve today's answer. With Supabase configured, stays unsettled until the
 * remote lookup finishes. Today never receives answer_id from the table;
 * guests and signed-in players both load clue-safe play state so they share
 * the same daily. Signed-in ranked play still validates guesses via attempts.
 */
export function useDailyPuzzleAnswer(
  mode: StatsModeId,
  taste: ReaderTaste,
  playablePool: Manhwa[],
  fallbackPool: Manhwa[],
  seedPrefix: string,
  dateKey: string,
  /**
   * When true (current-day / non-archive), fetch clue-safe play state instead
   * of local FNV so guests and signed-in players share the server daily.
   */
  useServerToday = true,
): DailyPuzzleAnswerState {
  const pool = playablePool.length > 0 ? playablePool : fallbackPool
  const localAnswer = useMemo(
    () => getDailyAnswer(pool, dateKey, seedPrefix),
    [pool, dateKey, seedPrefix],
  )
  const configured = isSupabaseConfigured()
  const useRemote = configured && (dateKey < getTodayKey() || useServerToday)

  const [answer, setAnswer] = useState(localAnswer)
  const [source, setSource] = useState<DailyAnswerSource>('local')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null)
  const [clue, setClue] = useState<DailyPublicClue | null>(null)
  const [rankedClueReady, setRankedClueReady] = useState(false)
  const [answerHidden, setAnswerHidden] = useState(false)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [settled, setSettled] = useState(!useRemote)

  useEffect(() => {
    if (!useRemote) {
      setAnswer(localAnswer)
      setSource('local')
      setCharacterId(null)
      setMeta(null)
      setClue(null)
      setRankedClueReady(false)
      setAnswerHidden(false)
      setMigrationMissing(false)
      setSettled(true)
      return
    }
    // Pending remote resolution — keep showing local as a placeholder only.
    setAnswer(localAnswer)
    setSource('local')
    setCharacterId(null)
    setMeta(null)
    setClue(null)
    setRankedClueReady(false)
    setAnswerHidden(false)
    setMigrationMissing(false)
    setSettled(false)
  }, [localAnswer, useRemote])

  useEffect(() => {
    if (!useRemote) return

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
      setMeta(result.meta)
      setClue(result.clue)
      setRankedClueReady(result.rankedClueReady)
      setAnswerHidden(result.answerHidden)
      setMigrationMissing(Boolean(result.migrationMissing))
      setSettled(true)
    })
    return () => {
      cancelled = true
    }
  }, [useRemote, mode, taste, playablePool, fallbackPool, seedPrefix, dateKey])

  return {
    answer,
    source,
    characterId,
    meta,
    clue,
    rankedClueReady,
    answerHidden,
    migrationMissing,
    settled,
  }
}
