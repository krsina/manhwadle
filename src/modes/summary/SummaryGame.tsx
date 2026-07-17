import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HardModeToggle } from '../../components/HardModeToggle'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
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
import { isArchiveDate } from '../../lib/archive'
import { displayTitle } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { scrubSummary } from '../../lib/spoiler'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
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
        ...compareGuess(guess, answer),
        displayLabel: label || undefined,
      },
    ]
  })
}

/** Default Manhwadle mode: progressive story blurbs → full scrubbed description. */
export function SummaryGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    summaryModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const isArchive = isArchiveDate(dateKey)
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  // Daily answers only from titles that have authored story blurbs
  const playablePool = useMemo(
    () => pool.filter((m) => storyBlurbIndex.has(m.id)),
    [pool],
  )

  const { answer: dailyAnswer } = useDailyPuzzleAnswer(
    'summary',
    taste,
    playablePool.length > 0 ? playablePool : pool,
    pool,
    tasteSeed,
    dateKey,
  )

  /** When set, play a random practice title instead of today's answer (not persisted). */
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const answerPool = playablePool.length > 0 ? playablePool : pool
  const answer =
    practiceIndex != null ? answerPool[practiceIndex] ?? dailyAnswer : dailyAnswer
  const isPractice = practiceIndex != null

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

  const modeTagline = hardMode
    ? 'Guess today’s manhwa from the opening summary only.'
    : tagline

  const blurbs = useMemo(() => {
    const authored = storyBlurbIndex.get(answer.id)
    if (hardMode) return buildHardRevealLadder(authored)
    const full = scrubSummary(answer)
    return buildRevealLadder(authored, full)
  }, [answer, hardMode])

  const [showResult, setShowResult] = useState(
    () =>
      (dayState.status === 'won' || dayState.status === 'lost') && hasSeenHowTo(id),
  )

  useEffect(() => {
    if (isPractice) return
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
    setHardMode(preferredHard)
    setDayState(
      createInitialState(dateKey, dailyAnswer.id, { hardMode: preferredHard }),
    )
    setShowResult(false)
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, id])

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

  const failedGuesses =
    dayState.status === 'won'
      ? Math.max(0, dayState.guessIds.length - 1)
      : dayState.guessIds.length

  const unlockedCount = revealedBlurbCount(failedGuesses, blurbs.length, { finished })
  const visibleBlurbs = useMemo(
    () => blurbs.slice(0, unlockedCount),
    [blurbs, unlockedCount],
  )

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

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
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

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      if (!isArchive) {
        sync.progress('summary', taste, next)
        if (won || lost) {
          recordDailyResult({
            modeId: 'summary',
            taste,
            dateKey,
            maxGuesses,
            won,
            guessCount: transition.guessIds.length,
          })
          sync.stats('summary', taste)
        }
      }
    }
    if (won || lost) setShowResult(true)
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
          <h1 className="mode-title">{modeTagline}</h1>
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
              <HardModeToggle
                enabled={hardMode}
                disabled={hardModeLocked}
                onChange={handleHardModeChange}
              />
            </div>
            <SummaryClue
              blurbs={visibleBlurbs}
              totalBlurbs={blurbs.length}
              finished={finished}
              hardMode={hardMode}
            />
          </div>
          {(import.meta.env.DEV || (isArchive && !isPractice)) && (
            <div className="character-test-bar">
              {import.meta.env.DEV && (
                <button type="button" className="btn btn-ghost" onClick={tryAnotherTitle}>
                  Guess another title
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
            disabled={finished}
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

      <ResultModal
        open={showResult}
        won={dayState.status === 'won'}
        answer={answer}
        guessCount={dayState.guessIds.length}
        maxGuesses={maxGuesses}
        shareText={shareText}
        shareLines={shareLines}
        modeId="summary"
        taste={taste}
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
      />
    </>
  )
}
