import { useEffect, useMemo, useState } from 'react'
import { AuthButton } from '../../components/AuthButton'
import { useAuth } from '../../components/AuthProvider'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HowToPlay } from '../../components/howto/HowToPlay'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { StatsButton } from '../../components/StatsButton'
import { SummaryClue } from '../../components/SummaryClue'
import { ThemeToggle } from '../../components/ThemeToggle'
import { APP_NAME } from '../../brand'
import storyBlurbData from '../../data/storyDescriptionBlurb.json'
import type { DayState, GuessFeedback, Manhwa } from '../../lib/anilist-types'
import {
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
import { displayTitle, getTodayKey } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { scrubSummary } from '../../lib/spoiler'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import { recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { summaryModeMeta } from './config'

const storyBlurbIndex = indexStoryBlurbs(
  storyBlurbData as StoryDescriptionBlurbFile,
)

function buildFeedbackRows(state: DayState, answer: Manhwa, pool: Manhwa[]): GuessFeedback[] {
  return state.guessIds
    .map((id) => findById(pool, id))
    .filter((m): m is Manhwa => Boolean(m))
    .map((guess) => compareGuess(guess, answer))
}

/** Default Manhwadle mode: progressive story blurbs → full scrubbed description. */
export function SummaryGame({ pool, guessPool, taste }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline, howTo } =
    summaryModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const dateKey = getTodayKey()
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
  )

  /** When set, play a random practice title instead of today's answer (not persisted). */
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const answerPool = playablePool.length > 0 ? playablePool : pool
  const answer =
    practiceIndex != null ? answerPool[practiceIndex] ?? dailyAnswer : dailyAnswer
  const isPractice = practiceIndex != null

  const blurbs = useMemo(() => {
    const authored = storyBlurbIndex.get(answer.id)
    const full = scrubSummary(answer)
    return buildRevealLadder(authored, full)
  }, [answer])

  const [dayState, setDayState] = useState<DayState>(() => {
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id)
  })

  useEffect(() => {
    if (isPractice) return
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) {
      setDayState(saved)
      return
    }
    setDayState((prev) => {
      if (prev.answerId === dailyAnswer.id) return prev
      if (prev.guessIds.length > 0) return prev
      return createInitialState(dateKey, dailyAnswer.id)
    })
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice])

  const [showResult, setShowResult] = useState(
    () =>
      (dayState.status === 'won' || dayState.status === 'lost') && hasSeenHowTo(id),
  )

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

  const shareText = useMemo(() => {
    const lines = feedbackRows.map(feedbackToShareLine)
    return buildShareText({
      appName: APP_NAME,
      modeLabel: name,
      tasteLabel: readerTasteShareLabel(taste),
      dateKey,
      guessCount: dayState.guessIds.length,
      maxGuesses,
      won: dayState.status === 'won',
      lines,
    })
  }, [feedbackRows, dateKey, dayState, maxGuesses, name, taste])

  function handleGuess(manhwa: Manhwa) {
    const transition = applyGuess(dayState, manhwa.id, answer.id, maxGuesses)
    if (!transition) return
    const next: DayState = {
      ...dayState,
      answerId: answer.id,
      guessIds: transition.guessIds,
      status: transition.status,
    }
    const won = transition.status === 'won'
    const lost = transition.status === 'lost'

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
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
    if (won || lost) setShowResult(true)
  }

  function tryAnotherTitle() {
    if (answerPool.length === 0) return
    const nextIndex = randomPlayableIndex(answerPool, answer.id)
    const nextAnswer = answerPool[nextIndex]!
    setPracticeIndex(nextIndex)
    setDayState(createInitialState(dateKey, nextAnswer.id))
    setShowResult(false)
  }

  return (
    <>
      <header className="hero">
        <div className="hero-copy">
          <p className="brand">{APP_NAME}</p>
          <p className="tagline">{tagline}</p>
        </div>
        <div className="hero-aside">
          <div className="hero-controls">
            <HowToPlay modeId={id} guide={howTo} />
            <StatsButton
              modeId="summary"
              modeLabel={name}
              taste={taste}
              maxGuesses={maxGuesses}
            />
            <AuthButton />
            <ThemeToggle />
          </div>
          <p className="day-meta">
            <span>{dateKey}</span>
            <span aria-hidden="true">·</span>
            <span>
              {isPractice
                ? 'Practice'
                : finished
                  ? dayState.status === 'won'
                    ? `Solved in ${dayState.guessIds.length}`
                    : 'Better luck tomorrow'
                  : `${remaining} guess${remaining === 1 ? '' : 'es'} left`}
            </span>
          </p>
        </div>
      </header>

      <div className="shell">
        <section className="play-top">
          <SummaryClue
            blurbs={visibleBlurbs}
            totalBlurbs={blurbs.length}
            finished={finished}
          />
          <div className="character-test-bar">
            <button type="button" className="btn btn-ghost" onClick={tryAnotherTitle}>
              Guess another title
            </button>
            {isPractice && (
              <p className="character-test-note">
                Practice round — does not overwrite today’s daily save.
              </p>
            )}
          </div>
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
              className="btn btn-primary reveal-btn"
              onClick={() => setShowResult(true)}
            >
              {showResult ? 'Show result again' : `Show answer — ${displayTitle(answer)}`}
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
        onClose={() => setShowResult(false)}
      />
    </>
  )
}
