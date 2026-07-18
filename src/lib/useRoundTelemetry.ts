import { useEffect, useRef } from 'react'
import type { ReaderTaste } from './readerTaste'
import {
  bucketDurationMs,
  bucketGuessCount,
  bucketHintCount,
  bucketProgress,
  telemetry,
  type TelemetryMode,
} from './telemetry'

interface UseRoundTelemetryInput {
  mode: TelemetryMode
  taste: ReaderTaste
  dateKey: string
  hardMode: boolean
  isPractice: boolean
  isArchive: boolean
  /** False until the daily answer is ready / crops exist. */
  active: boolean
  status: 'playing' | 'won' | 'lost'
  guessCount: number
  hintsUsed: number
}

interface RoundTelemetryApi {
  trackCompleted: (input: {
    won: boolean
    surrendered: boolean
    guessCount: number
    hintsUsed: number
    hardMode: boolean
  }) => void
  trackBonus: (correct: boolean) => void
  trackNextRound: () => void
}

/**
 * Sparse round lifecycle telemetry. Abandonment uses pagehide + a microtask
 * unmount flush so React StrictMode remounts do not double-fire.
 */
export function useRoundTelemetry(input: UseRoundTelemetryInput): RoundTelemetryApi {
  const {
    mode,
    taste,
    dateKey,
    hardMode,
    isPractice,
    isArchive,
    active,
    status,
    guessCount,
  } = input

  const startedAtRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const liveRef = useRef({
    mode,
    taste,
    guessCount,
    status,
    active,
    isPractice,
    isArchive,
  })
  liveRef.current = {
    mode,
    taste,
    guessCount,
    status,
    active,
    isPractice,
    isArchive,
  }

  const instanceIdRef = useRef(0)

  useEffect(() => {
    if (!active || isPractice || isArchive) return
    if (status !== 'playing') {
      completedRef.current = status === 'won' || status === 'lost'
      return
    }

    completedRef.current = false
    const dedupeKey = `round_started:${mode}:${taste}:${dateKey}`
    const emitted = telemetry.roundStarted({
      mode,
      taste,
      hard_mode: hardMode,
      dedupeKey,
    })
    if (emitted || startedAtRef.current == null) {
      startedAtRef.current = performance.now()
    }

    const instanceId = ++instanceIdRef.current

    function maybeAbandon() {
      const live = liveRef.current
      if (live.isPractice || live.isArchive || !live.active) return
      if (live.status !== 'playing') return
      if (completedRef.current) return
      if (instanceIdRef.current !== instanceId) return
      telemetry.abandonment({
        mode: live.mode,
        taste: live.taste,
        progress_bucket: bucketProgress(live.guessCount),
        dedupeKey: `abandon:${live.mode}:${taste}:${dateKey}:${bucketProgress(live.guessCount)}`,
      })
    }

    function onPageHide() {
      maybeAbandon()
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') maybeAbandon()
    }

    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      // StrictMode: remount bumps instanceId before this microtask runs.
      queueMicrotask(() => {
        maybeAbandon()
      })
    }
  }, [active, isPractice, isArchive, status, mode, taste, dateKey, hardMode])

  return {
    trackCompleted({ won, surrendered, guessCount: guesses, hintsUsed: hints, hardMode: hard }) {
      completedRef.current = true
      const started = startedAtRef.current
      const duration = started == null ? 0 : performance.now() - started
      telemetry.roundCompleted({
        mode,
        taste,
        outcome: won ? 'won' : 'lost',
        surrendered,
        guess_bucket: bucketGuessCount(guesses),
        hint_bucket: bucketHintCount(hints),
        duration_bucket: bucketDurationMs(duration),
        hard_mode: hard,
      })
    },
    trackBonus(correct) {
      telemetry.bonusResult(mode, correct)
    },
    trackNextRound() {
      telemetry.nextRound(mode, taste)
    },
  }
}
