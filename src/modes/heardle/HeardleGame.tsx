import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HardModeToggle } from '../../components/HardModeToggle'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { SongClue } from '../../components/SongClue'
import { SurrenderModal } from '../../components/SurrenderModal'
import { APP_NAME } from '../../brand'
import {
  type DayState,
  type GuessFeedback,
  type Manhwa,
} from '../../lib/anilist-types'
import { pickMainCharacter } from '../../lib/protagonist'
import {
  buildShareText,
  compareGuess,
  feedbackToShareLine,
} from '../../lib/compare'
import { isArchiveDate } from '../../lib/archive'
import { displayTitle } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import {
  advanceClue,
  canAdvanceClue,
  clueProgress,
} from '../../lib/clueProgress'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import {
  isSurrenderedLoss,
  queueVerifiedDailyCompletion,
} from '../../lib/ranked'
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import {
  clipSecondsForGuesses,
  filterPoolBySongs,
  pickSongForDay,
} from '../../lib/songs'
import { useRoundTelemetry } from '../../lib/useRoundTelemetry'
import type { GameModeProps } from '../types'
import { heardleModeMeta } from './config'

const HARD_MODE_STORAGE_KEY = 'manhwadle:heardle:hard-mode'

function loadHardModePreference(): boolean {
  try {
    return localStorage.getItem(HARD_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveHardModePreference(enabled: boolean) {
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
        ...compareGuess(guess, answer),
        displayLabel: label || undefined,
      },
    ]
  })
}

/** Heardle mode: progressive YouTube song clips → guess the manhwa. */
export function HeardleGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    heardleModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const isArchive = isArchiveDate(dateKey)
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  /** Daily answer always from vocal-covered titles (same puzzle normal/hard). */
  const playablePool = useMemo(
    () => filterPoolBySongs(pool, { includeBgm: false }),
    [pool],
  )
  const hasSongs = playablePool.length > 0

  const { answer: dailyAnswer, settled: answerSettled } = useDailyPuzzleAnswer(
    'heardle',
    taste,
    playablePool,
    pool,
    tasteSeed,
    dateKey,
  )

  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const answer =
    practiceIndex != null ? playablePool[practiceIndex] ?? dailyAnswer : dailyAnswer
  const isPractice = practiceIndex != null
  const answerReady = isPractice || answerSettled

  const [dayState, setDayState] = useState<DayState>(() => {
    if (!hasSongs) {
      return createInitialState(dateKey, dailyAnswer.id)
    }
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id, {
      hardMode: loadHardModePreference(),
    })
  })

  const [hardMode, setHardMode] = useState(() => {
    if (dayState.hardMode != null) return dayState.hardMode
    if (dayState.guessIds.length > 0) return false
    return loadHardModePreference()
  })

  const songSeed = isPractice
    ? withTastePrefix(`${seedPrefix}:practice:${answer.id}`, taste)
    : tasteSeed

  const song = useMemo(
    () =>
      pickSongForDay(
        answer.id,
        isPractice ? `${dateKey}:practice:${answer.id}` : dateKey,
        songSeed,
        hardMode,
      ),
    [answer.id, dateKey, songSeed, hardMode, isPractice],
  )

  useEffect(() => {
    if (!hasSongs || isPractice || !answerSettled) return
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) {
      setDayState(saved)
      if (saved.hardMode != null) setHardMode(saved.hardMode)
      else if (saved.guessIds.length > 0) setHardMode(false)
      else setHardMode(loadHardModePreference())
      setShowResult(
        (saved.status === 'won' || saved.status === 'lost') && hasSeenHowTo(id),
      )
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
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, hasSongs, answerSettled, id])

  const [showResult, setShowResult] = useState(
    () =>
      hasSongs &&
      (dayState.status === 'won' || dayState.status === 'lost') &&
      hasSeenHowTo(id),
  )
  const [showSurrender, setShowSurrender] = useState(false)

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
    () => (hasSongs ? buildFeedbackRows(dayState, answer, guessPool) : []),
    [hasSongs, dayState, answer, guessPool],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])
  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = maxGuesses - dayState.guessIds.length
  const finished = dayState.status !== 'playing'
  const surrendered =
    dayState.status === 'lost' && dayState.guessIds.length < maxGuesses

  const roundTelemetry = useRoundTelemetry({
    mode: 'heardle',
    taste,
    dateKey,
    hardMode,
    isPractice,
    isArchive,
    active: answerReady && hasSongs,
    status: dayState.status,
    guessCount: dayState.guessIds.length,
    hintsUsed: dayState.hintsUsed ?? 0,
  })

  const progress = clueProgress(dayState)
  const maxClueStep = Math.max(0, maxGuesses - 1)
  const canRevealMore = answerReady && canAdvanceClue(dayState, maxClueStep)

  const clipSeconds = clipSecondsForGuesses(progress, maxGuesses)
  /** Hard mode is audio-only; normal mode shows the MV with progressive zoom-out. */
  const showVideo = !hardMode

  const bonusCharacter = useMemo(
    () => (dayState.status === 'won' ? pickMainCharacter(answer) : null),
    [dayState.status, answer],
  )

  const firstTryWin =
    dayState.status === 'won' && dayState.guessIds.length === 1
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
      if (!isArchive) sync.progress('heardle', taste, next)
    }
  }

  function submitTerminal(next: DayState, won: boolean, surrendered: boolean) {
    if (isPractice || isArchive) return
    recordDailyResult({
      modeId: 'heardle',
      taste,
      dateKey,
      maxGuesses,
      won,
      guessCount: next.guessIds.length,
      hintsUsed: next.hintsUsed ?? 0,
    })
    sync.stats('heardle', taste)
    queueVerifiedDailyCompletion({
      userId: user?.id,
      isPractice,
      isArchive,
      mode: 'heardle',
      taste,
      guessIds: next.guessIds,
      hintsUsed: next.hintsUsed ?? 0,
      hardMode: Boolean(next.hardMode ?? hardMode),
      surrendered,
      dateKey,
    })
    roundTelemetry.trackCompleted({
      won,
      surrendered,
      guessCount: next.guessIds.length,
      hintsUsed: next.hintsUsed ?? 0,
      hardMode: Boolean(next.hardMode ?? hardMode),
    })
  }

  function handleRevealMore() {
    if (!answerReady) return
    const next = advanceClue(dayState, maxClueStep)
    if (!next) return
    persistDay(next)
  }

  function handleSurrender() {
    if (!answerReady || !hasSongs || dayState.status !== 'playing') return
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

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
    if (!answerReady || !hasSongs) return
    const transition = applyGuess(dayState, manhwa.id, answer.id, maxGuesses)
    if (!transition) return
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
      submitTerminal(
        next,
        won,
        isSurrenderedLoss(transition.status, transition.guessIds.length, maxGuesses),
      )
      setShowResult(true)
    }
  }

  function tryAnotherSong() {
    if (!hasSongs || playablePool.length === 0) return
    const nextIndex = randomPlayableIndex(playablePool, answer.id)
    const nextAnswer = playablePool[nextIndex]!
    setPracticeIndex(nextIndex)
    setDayState(
      createInitialState(dateKey, nextAnswer.id, { hardMode }),
    )
    setShowResult(false)
    setShowSurrender(false)
    roundTelemetry.trackNextRound()
  }

  function handleBonusNameAnswer(result: { guess: string; correct: boolean }) {
    if (dayState.bonusNameGuess != null) return

    const firstTry = dayState.status === 'won' && dayState.guessIds.length === 1
    const isDoubleSolve = result.correct && firstTry
    const next: DayState = {
      ...dayState,
      bonusNameGuess: result.guess,
      bonusNameCorrect: result.correct,
    }

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      if (!isArchive) {
        sync.progress('heardle', taste, next)
        recordBonusResult({
          modeId: 'heardle',
          taste,
          dateKey,
          maxGuesses,
          correct: result.correct,
          doubleSolve: isDoubleSolve,
        })
        sync.stats('heardle', taste)
        roundTelemetry.trackBonus(result.correct)
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
        </div>
        <div className="hero-aside">
          <p className="day-meta">
            <span>{dateKey}</span>
            <span aria-hidden="true">·</span>
            <span>
              {!hasSongs
                ? 'No songs'
                : isPractice
                  ? 'Practice'
                  : finished
                    ? dayState.status === 'won'
                      ? `Solved in ${dayState.guessIds.length}`
                      : isArchive
                        ? 'Out of guesses'
                        : 'Better luck tomorrow'
                    : `${remaining} guess${remaining === 1 ? '' : 'es'} left`}
            </span>
          </p>
        </div>
      </header>

      {!hasSongs || !song ? (
        <section className="mode-empty">
          <p className="mode-empty-title">Song clips not ready</p>
          <p className="mode-empty-body">
            This mode needs curated OST entries mapped to titles in your taste pool.
          </p>
        </section>
      ) : (
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
                  titleOn="BGM pool · audio only (no video)"
                  titleOff="BGM pool · audio only (no video)"
                  titleLocked="Hard mode locks after your first guess"
                />
              </div>
              <SongClue
                song={song}
                clipSeconds={clipSeconds}
                failedGuesses={progress}
                finished={finished}
                maxGuesses={maxGuesses}
                showVideo={showVideo}
                canRevealMore={canRevealMore}
                onRevealMore={handleRevealMore}
              />
            </div>
            {(import.meta.env.DEV || (isArchive && !isPractice)) && (
              <div className="character-test-bar">
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={tryAnotherSong}
                  >
                    Guess another song
                  </button>
                )}
                {isArchive && !isPractice && (
                  <p className="character-test-note">
                    Archive puzzle — saved on this device; doesn’t count toward stats.
                  </p>
                )}
                {import.meta.env.DEV && isPractice && (
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
      )}

      {hasSongs && song && (
        <>
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
      )}
    </>
  )
}
