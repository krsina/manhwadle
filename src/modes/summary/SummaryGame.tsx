import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HardModeToggle } from '../../components/HardModeToggle'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { SurrenderModal } from '../../components/SurrenderModal'
import { SummaryClue } from '../../components/SummaryClue'
import { APP_NAME } from '../../brand'
import storyBlurbData from '../../data/storyDescriptionBlurb.json'
import {
  type DayState,
  type GuessFeedback,
  type Manhwa,
} from '../../lib/anilist-types'
import { pickMainCharacter } from '../../lib/protagonist'
import {
  buildHardRevealLadder,
  buildRevealLadder,
  indexStoryBlurbs,
  revealedBlurbCount,
  type StoryDescriptionBlurbFile,
} from '../../lib/blurbs'
import {
  buildShareText,
  compareGuess,
  feedbackToShareLine,
} from '../../lib/compare'
import { isArchiveDate, isFirstTrySolve } from '../../lib/archive'
import { displayTitle } from '../../lib/daily'
import { useOwnerDevAccess } from '../../lib/useOwnerDevAccess'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { scrubSummary } from '../../lib/spoiler'
import {
  advanceClue,
  canAdvanceClue,
  clueProgress,
} from '../../lib/clueProgress'
import { applyGuess } from '../../lib/guessLoop'
import { reportWrongGenreIfCompleteMiss } from '../../lib/secretEvents'
import {
  createInitialState,
  loadDayState,
  reconcileDayStateWithAttempt,
  saveDayState,
} from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import {
  applyRankedCompletionReward,
  isSurrenderedLoss,
  queueBonusNameReward,
  queueVerifiedDailyCompletion,
  shouldUseServerRankedAttempt,
  submitRankedDailyGuess,
} from '../../lib/ranked'
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { summaryModeMeta } from './config'

const storyBlurbIndex = indexStoryBlurbs(
  storyBlurbData as StoryDescriptionBlurbFile,
)

const HARD_MODE_STORAGE_KEY = 'manhwadle:summary:hard-mode'

function loadHardModePreference(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(HARD_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveHardModePreference(enabled: boolean) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(HARD_MODE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function buildFeedbackRows(state: DayState, answer: Manhwa, pool: Manhwa[]): GuessFeedback[] {
  const labels = state.guessLabels ?? []
  return state.guessIds.flatMap((id, index) => {
    const guess = findById(pool, id)
    if (!guess) return []
    const label = labels[index]?.trim()
    return [
      {
        ...compareGuess(guess, answer, label),
      },
    ]
  })
}

/** Default Manhwadle mode: progressive story blurbs → full scrubbed description. */
export function SummaryGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id: _id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    summaryModeMeta
  const { user } = useAuth()
  const { ownerDev } = useOwnerDevAccess()
  const sync = syncAfterLocalChange(user?.id)
  const isArchive = isArchiveDate(dateKey)
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  // Daily answers only from titles that have authored story blurbs
  const playablePool = useMemo(
    () => pool.filter((m) => storyBlurbIndex.has(m.id)),
    [pool],
  )

  const {
    answer: dailyAnswer,
    attempt: serverAttempt,
    settled: answerSettled,
    migrationMissing,
    clue,
    rankedClueReady,
  } = useDailyPuzzleAnswer(
    'summary',
    taste,
    playablePool.length > 0 ? playablePool : pool,
    pool,
    tasteSeed,
    dateKey,
    Boolean(!isArchive),
  )

  /** When set, play a random practice title instead of today's answer (not persisted). */
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const [rankedRevealId, setRankedRevealId] = useState<number | null>(null)
  const [forcedLocalOnly, setForcedLocalOnly] = useState(false)
  const forcedLocalOnlyRef = useRef(false)
  const answerPool = playablePool.length > 0 ? playablePool : pool
  const rankedRevealedAnswer =
    rankedRevealId != null ? findById(answerPool, rankedRevealId) : null
  const answer =
    practiceIndex != null
      ? answerPool[practiceIndex] ?? dailyAnswer
      : rankedRevealedAnswer ?? dailyAnswer
  const isPractice = practiceIndex != null
  const wantsRanked = shouldUseServerRankedAttempt({
    userId: user?.id,
    isPractice,
    isArchive,
  })
  const localOnlyToday = wantsRanked && (migrationMissing || forcedLocalOnly)
  const rankedPayloadMissing = wantsRanked && !migrationMissing && !rankedClueReady
  const answerReady = isPractice || (answerSettled && !rankedPayloadMissing)

  const [dayState, setDayState] = useState<DayState>(() => {
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id, {
      hardMode: loadHardModePreference(),
    })
  })

  /** Hard mode = t0 only. Prefer the day's locked value once play has started. */
  const [hardMode, setHardMode] = useState(() => {
    if (dayState.hardMode != null) return dayState.hardMode
    // Legacy day saves without hardMode were normal mode.
    if (dayState.guessIds.length > 0) return false
    return loadHardModePreference()
  })

  const blurbs = useMemo(() => {
    if (
      !isPractice &&
      clue?.type === 'summary' &&
      Array.isArray(clue.blurbs)
    ) {
      const serverBlurbs = clue.blurbs.filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
      )
      return hardMode ? serverBlurbs.slice(0, 1) : serverBlurbs
    }
    const authored = storyBlurbIndex.get(answer.id)
    if (hardMode) return buildHardRevealLadder(authored)
    const full = scrubSummary(answer)
    return buildRevealLadder(authored, full)
  }, [answer, hardMode, isPractice, clue])

  const [showResult, setShowResult] = useState(
    () => dayState.status === 'won' || dayState.status === 'lost',
  )
  const [showSurrender, setShowSurrender] = useState(false)

  useEffect(() => {
    if (isPractice || !answerSettled) return
    const saved = loadDayState(dateKey, tasteStorage)
    if (serverAttempt) {
      const reconciled = reconcileDayStateWithAttempt(
        saved ?? createInitialState(dateKey, dailyAnswer.id),
        serverAttempt,
        dailyAnswer.id,
      )
      saveDayState(reconciled, tasteStorage)
      setDayState(reconciled)
      setHardMode(reconciled.hardMode ?? false)
      setShowResult(reconciled.status !== 'playing')
      setShowSurrender(false)
      return
    }
    if (saved && saved.answerId === dailyAnswer.id) {
      setDayState(saved)
      if (saved.hardMode != null) setHardMode(saved.hardMode)
      else if (saved.guessIds.length > 0) setHardMode(false)
      else setHardMode(loadHardModePreference())
      setShowResult(saved.status === 'won' || saved.status === 'lost')
      return
    }
    const preferredHard = loadHardModePreference()
    let didReset = false
    setDayState((prev) => {
      if (
        prev.dateKey === dateKey &&
        (prev.guessIds.length > 0 ||
          (prev.hintsUsed ?? 0) > 0 ||
          prev.status !== 'playing')
      ) {
        return prev
      }
      didReset = true
      return createInitialState(dateKey, dailyAnswer.id, {
        hardMode: preferredHard,
      })
    })
    if (didReset) {
      setHardMode(preferredHard)
      setShowResult(false)
      setShowSurrender(false)
    }
  }, [
    dailyAnswer.id,
    dateKey,
    tasteStorage,
    isPractice,
    answerSettled,
    serverAttempt,
  ])

  const hardModeLocked = dayState.guessIds.length > 0

  function handleHardModeChange(next: boolean) {
    if (hardModeLocked) return
    saveHardModePreference(next)
    setHardMode(next)
    setDayState((prev) => {
      const updated = { ...prev, hardMode: next }
      if (!isPractice) saveDayState(updated, tasteStorage)
      return updated
    })
  }

  const feedbackRows = useMemo(
    () => buildFeedbackRows(dayState, answer, guessPool),
    [dayState, answer, guessPool],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])

  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = maxGuesses - dayState.guessIds.length
  const finished = dayState.status !== 'playing'
  const surrendered =
    dayState.status === 'lost' && dayState.guessIds.length < maxGuesses


  const progress = clueProgress(dayState)
  const maxClueStep = Math.max(0, blurbs.length - 1)
  const canRevealMore =
    answerReady && !hardMode && canAdvanceClue(dayState, maxClueStep)

  const unlockedCount = revealedBlurbCount(progress, blurbs.length, { finished })
  const visibleBlurbs = useMemo(
    () => blurbs.slice(0, unlockedCount),
    [blurbs, unlockedCount],
  )

  const bonusCharacter = useMemo(
    () => (dayState.status === 'won' ? pickMainCharacter(answer) : null),
    [dayState.status, answer],
  )

  const firstTryWin = isFirstTrySolve({
    won: dayState.status === 'won',
    guessCount: dayState.guessIds.length,
    hintsUsed: dayState.hintsUsed,
  })
  const doubleSolve =
    firstTryWin && dayState.bonusNameCorrect === true

  const shareLines = useMemo(
    () => feedbackRows.map(feedbackToShareLine),
    [feedbackRows],
  )

  const shareText = useMemo(() => {
    return buildShareText({
      appName: APP_NAME,
      modeLabel: name,
      tasteLabel: readerTasteShareLabel(taste),
      dateKey,
      guessCount: dayState.guessIds.length,
      maxGuesses,
      won: dayState.status === 'won',
      lines: shareLines,
      bonusCorrect:
        dayState.bonusNameGuess != null ? Boolean(dayState.bonusNameCorrect) : null,
      doubleSolve,
      archive: isArchive,
      hardMode,
      hintsUsed: dayState.hintsUsed ?? 0,
    })
  }, [
    shareLines,
    dateKey,
    dayState,
    maxGuesses,
    name,
    taste,
    doubleSolve,
    isArchive,
    hardMode,
  ])

  function persistDay(next: DayState) {
    setDayState(next)
    if (!isPractice && answerReady) {
      saveDayState(next, tasteStorage)
      if (
        !isArchive &&
        !localOnlyToday &&
        !forcedLocalOnlyRef.current &&
        (!wantsRanked || (next.status !== 'playing' && next.answerId > 0))
      ) {
        sync.progress('summary', taste, next)
      }
    }
  }

  function submitTerminal(
    next: DayState,
    won: boolean,
    surrendered: boolean,
    opts: { rankedAlreadyFinalized?: boolean } = {},
  ) {
    if (isPractice || isArchive) return
    if (localOnlyToday || forcedLocalOnlyRef.current) return
    recordDailyResult({
      modeId: 'summary',
      taste,
      dateKey,
      maxGuesses,
      won,
      guessCount: next.guessIds.length,
      hintsUsed: next.hintsUsed ?? 0,
    })
    sync.stats('summary', taste)
    if (opts.rankedAlreadyFinalized) return
    queueVerifiedDailyCompletion({
      userId: user?.id,
      isPractice,
      isArchive,
      mode: 'summary',
      taste,
      guessIds: next.guessIds,
      hintsUsed: next.hintsUsed ?? 0,
      hardMode: Boolean(next.hardMode ?? hardMode),
      surrendered,
      dateKey,
      onResult: (result) => {
        if (result.status === 'ok' && result.answerId != null) {
          setRankedRevealId(result.answerId)
        }
      },
    })
  }

  function handleRevealMore() {
    if (!answerReady) return
    const next = advanceClue(dayState, maxClueStep)
    if (!next) return
    persistDay(next)
  }

  function handleSurrender() {
    if (!answerReady || dayState.status !== 'playing') return
    setShowSurrender(false)
    const next: DayState = {
      ...dayState,
      answerId: answer.id,
      status: 'lost',
      hardMode,
    }
    persistDay(next)
    submitTerminal(next, false, true)
    setShowResult(true)
  }

  function applyLocalGuess(manhwa: Manhwa, matchedLabel?: string) {
    const transition = applyGuess(dayState, manhwa.id, answer.id, maxGuesses)
    if (!transition) return
    reportWrongGenreIfCompleteMiss(manhwa, answer)
    const priorLabels = dayState.guessLabels ?? []
    const guessLabels = [
      ...dayState.guessIds.map((_, i) => priorLabels[i] || ''),
      matchedLabel?.trim() || displayTitle(manhwa),
    ]
    const next: DayState = {
      ...dayState,
      answerId: answer.id,
      guessIds: transition.guessIds,
      guessLabels,
      status: transition.status,
      hardMode,
    }
    const won = transition.status === 'won'
    const lost = transition.status === 'lost'

    persistDay(next)
    if (won || lost) {
      submitTerminal(next, won, isSurrenderedLoss(transition.status, transition.guessIds.length, maxGuesses))
      setShowResult(true)
    }
  }

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
    if (!answerReady || dayState.status !== 'playing') return

    const useServer =
      shouldUseServerRankedAttempt({
        userId: user?.id,
        isPractice,
        isArchive,
      }) && !migrationMissing

    if (!useServer) {
      applyLocalGuess(manhwa, matchedLabel)
      return
    }

    void (async () => {
      const ranked = await submitRankedDailyGuess({
        userId: user?.id,
        isPractice,
        isArchive,
        mode: 'summary',
        taste,
        guessId: manhwa.id,
        hintsUsed: dayState.hintsUsed ?? 0,
        hardMode,
        dateKey,
      })

      if (ranked.status === 'skipped' && ranked.reason === 'migration_missing') {
        forcedLocalOnlyRef.current = true
        setForcedLocalOnly(true)
        applyLocalGuess(manhwa, matchedLabel)
        return
      }
      if (ranked.status !== 'ok' || !ranked.accepted) {
        if (ranked.status === 'error') {
          console.warn('[ranked]', ranked.warning, ranked.message)
        }
        return
      }

      reportWrongGenreIfCompleteMiss(manhwa, answer)
      const priorLabels = dayState.guessLabels ?? []
      const guessLabels = [
        ...dayState.guessIds.map((_, i) => priorLabels[i] || ''),
        matchedLabel?.trim() || displayTitle(manhwa),
      ]
      const revealedAnswerId = ranked.answerId ?? answer.id
      if (ranked.answerId != null) setRankedRevealId(ranked.answerId)
      const next: DayState = {
        ...dayState,
        answerId: revealedAnswerId,
        guessIds: ranked.guessIds,
        guessLabels,
        status: ranked.dayStatus,
        hardMode,
      }
      persistDay(next)
      if (ranked.finalized) {
        if (ranked.completion) applyRankedCompletionReward(ranked.completion)
        submitTerminal(
          next,
          ranked.dayStatus === 'won',
          isSurrenderedLoss(ranked.dayStatus, ranked.guessIds.length, maxGuesses),
          { rankedAlreadyFinalized: true },
        )
        setShowResult(true)
      }
    })()
  }

  function tryAnotherTitle() {
    if (answerPool.length === 0) return
    const nextIndex = randomPlayableIndex(answerPool, answer.id)
    const nextAnswer = answerPool[nextIndex]!
    setPracticeIndex(nextIndex)
    setDayState(
      createInitialState(dateKey, nextAnswer.id, { hardMode }),
    )
    setShowResult(false)
    setShowSurrender(false)
  }

  function handleBonusNameAnswer(result: {
    guess: string
    correct: boolean
    guessedCharacterId?: number
    guessLabel?: string
  }) {
    if (dayState.bonusNameGuess != null) return

    const firstTry = isFirstTrySolve({
      won: dayState.status === 'won',
      guessCount: dayState.guessIds.length,
      hintsUsed: dayState.hintsUsed,
    })
    const isDoubleSolve = result.correct && firstTry
    const next: DayState = {
      ...dayState,
      bonusNameGuess: result.guess,
      bonusNameCorrect: result.correct,
    }

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      if (!isArchive && !localOnlyToday) {
        sync.progress('summary', taste, next)
        recordBonusResult({
          modeId: 'summary',
          taste,
          dateKey,
          maxGuesses,
          correct: result.correct,
          doubleSolve: isDoubleSolve,
        })
        sync.stats('summary', taste)
        if (result.guessedCharacterId != null && result.guessedCharacterId > 0) {
          queueBonusNameReward({
            userId: user?.id,
            isPractice,
            isArchive,
            mode: 'summary',
            taste,
            correct: result.correct,
            firstTry,
            guessedCharacterId: result.guessedCharacterId,
            guessLabel: result.guessLabel ?? result.guess,
            dateKey,
          })
        }
      }
    }
  }

  return (
    <>
      <header className="hero">
        <div className="hero-copy">
          <p className="mode-kicker">
            {isArchive ? `Archive · ${name}` : `Today’s ${name} puzzle`}
          </p>
          <h1 className="mode-title">{tagline}</h1>
          {localOnlyToday && (
            <p className="day-meta" role="status">
              Local-only play — ranked sync is unavailable until the security migration is deployed.
            </p>
          )}
          {rankedPayloadMissing && (
            <p className="day-meta" role="alert">
              Ranked puzzle unavailable: the server has no clue-safe metadata for today.
            </p>
          )}
        </div>
        <div className="hero-aside">
          <p className="day-meta">
            <span>{dateKey}</span>
            <span aria-hidden="true">·</span>
            <span>
              {isPractice
                ? 'Practice'
                : finished
                  ? dayState.status === 'won'
                    ? `Solved in ${dayState.guessIds.length}`
                    : surrendered
                      ? 'Gave up'
                      : isArchive
                        ? 'Out of guesses'
                        : 'Better luck tomorrow'
                  : `${remaining} guess${remaining === 1 ? '' : 'es'} left`}
            </span>
          </p>
        </div>
      </header>

      <div className="shell">
        <section className="play-top">
          <div className="clue-stack clue-stack-overlap">
            <div className="clue-toolbar">
              <button
                type="button"
                className="surrender-toggle"
                disabled={!answerReady || finished}
                onClick={() => {
                  if (!answerReady || finished) return
                  setShowSurrender(true)
                }}
              >
                I give up
              </button>
              <HardModeToggle
                enabled={hardMode}
                disabled={!answerReady || hardModeLocked}
                onChange={handleHardModeChange}
              />
            </div>
            <SummaryClue
              blurbs={visibleBlurbs}
              totalBlurbs={blurbs.length}
              finished={finished}
              hardMode={hardMode}
              canRevealMore={canRevealMore}
              onRevealMore={hardMode ? undefined : handleRevealMore}
            />
          </div>
          {(ownerDev || (isArchive && !isPractice)) && (
            <div className="character-test-bar">
              {ownerDev && (
                <button type="button" className="btn btn-ghost" onClick={tryAnotherTitle}>
                  Guess another title
                </button>
              )}
              {isArchive && !isPractice && (
                <p className="character-test-note">
                  Archive puzzle — saved on this device; doesn’t count toward stats.
                </p>
              )}
              {ownerDev && isPractice && (
                <p className="character-test-note">
                  Practice round — does not overwrite{' '}
                  {isArchive ? 'this archive' : 'today’s daily'} save.
                </p>
              )}
            </div>
          )}
          <GuessInput
            pool={guessPool}
            disabled={!answerReady || finished}
            disabledPlaceholder={
              surrendered ? 'You gave up — round over' : undefined
            }
            excludedIds={excludedIds}
            onGuess={handleGuess}
          />
        </section>

        <aside className="side-rail" aria-label="Known information">
          <KnownInfoPanel info={knownInfo} hasGuesses={feedbackRows.length > 0} />
          {finished && (
            <button
              type="button"
              className="btn btn-primary btn-cta"
              onClick={() => setShowResult(true)}
            >
              Show answer
            </button>
          )}
        </aside>

        <section className="play-bottom">
          <FeedbackGrid rows={feedbackRows} />
        </section>
      </div>

      <SurrenderModal
        open={showSurrender}
        onCancel={() => setShowSurrender(false)}
        onConfirm={handleSurrender}
      />

      <ResultModal
        open={showResult}
        won={dayState.status === 'won'}
        answer={answer}
        guessCount={dayState.guessIds.length}
        maxGuesses={maxGuesses}
        hintsUsed={dayState.hintsUsed ?? 0}
        hardMode={hardMode}
        shareText={shareText}
        shareLines={shareLines}
        onClose={() => setShowResult(false)}
        bonusCharacter={bonusCharacter}
        bonusPrompt="Who is the main character?"
        characterGuessPool={guessPool}
        bonusNameResult={
          dayState.bonusNameGuess != null
            ? {
                guess: dayState.bonusNameGuess,
                correct: Boolean(dayState.bonusNameCorrect),
              }
            : null
        }
        onBonusNameAnswer={handleBonusNameAnswer}
        isArchive={isArchive}
        surrendered={surrendered}
      />
    </>
  )
}
