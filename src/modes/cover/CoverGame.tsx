import { useEffect, useMemo, useState } from 'react'
import { AuthButton } from '../../components/AuthButton'
import { useAuth } from '../../components/AuthProvider'
import { CoverClue } from '../../components/CoverClue'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HowToPlay } from '../../components/howto/HowToPlay'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { StatsButton } from '../../components/StatsButton'
import { ThemeToggle } from '../../components/ThemeToggle'
import { APP_NAME } from '../../brand'
import type { DayState, GuessFeedback, Manhwa } from '../../lib/anilist-types'
import {
  buildShareText,
  compareGuess,
  feedbackToShareLine,
} from '../../lib/compare'
import { manhwaHasCover } from '../../lib/cover'
import { displayTitle, getTodayKey } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import { recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { coverModeMeta } from './config'

function buildFeedbackRows(state: DayState, answer: Manhwa, pool: Manhwa[]): GuessFeedback[] {
  return state.guessIds
    .map((id) => findById(pool, id))
    .filter((m): m is Manhwa => Boolean(m))
    .map((guess) => compareGuess(guess, answer))
}

/** Cover mode: progressive zoom-out on the daily title's cover art. */
export function CoverGame({ pool, guessPool, taste }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline, howTo } =
    coverModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const dateKey = getTodayKey()
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  const playablePool = useMemo(
    () => pool.filter(manhwaHasCover),
    [pool],
  )

  const hasCovers = playablePool.length > 0

  const { answer: dailyAnswer } = useDailyPuzzleAnswer(
    'cover',
    taste,
    playablePool,
    pool,
    tasteSeed,
  )

  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const answer =
    practiceIndex != null ? playablePool[practiceIndex] ?? dailyAnswer : dailyAnswer
  const isPractice = practiceIndex != null

  const coverUrl = answer.coverImage?.trim() || null
  const focusSeed = isPractice
    ? withTastePrefix(`${seedPrefix}:practice:${answer.id}`, taste)
    : tasteSeed

  const [dayState, setDayState] = useState<DayState>(() => {
    if (!hasCovers) {
      return createInitialState(dateKey, dailyAnswer.id)
    }
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id)
  })

  useEffect(() => {
    if (!hasCovers || isPractice) return
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
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, hasCovers])

  const [showResult, setShowResult] = useState(
    () =>
      hasCovers &&
      (dayState.status === 'won' || dayState.status === 'lost') &&
      hasSeenHowTo(id),
  )

  const feedbackRows = useMemo(
    () => (hasCovers ? buildFeedbackRows(dayState, answer, guessPool) : []),
    [hasCovers, dayState, answer, guessPool],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])
  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = maxGuesses - dayState.guessIds.length
  const finished = dayState.status !== 'playing'

  const failedGuesses =
    dayState.status === 'won'
      ? Math.max(0, dayState.guessIds.length - 1)
      : dayState.guessIds.length

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
    if (!hasCovers) return
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
      sync.progress('cover', taste, next)
      if (won || lost) {
        recordDailyResult({
          modeId: 'cover',
          taste,
          dateKey,
          maxGuesses,
          won,
          guessCount: transition.guessIds.length,
        })
        sync.stats('cover', taste)
      }
    }
    if (won || lost) setShowResult(true)
  }

  function tryAnotherCover() {
    if (!hasCovers || playablePool.length === 0) return
    const nextIndex = randomPlayableIndex(playablePool, answer.id)
    const nextAnswer = playablePool[nextIndex]!
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
              modeId="cover"
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
              {!hasCovers
                ? 'No covers'
                : isPractice
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

      {!hasCovers || !coverUrl ? (
        <section className="mode-empty">
          <p className="mode-empty-title">Cover art not ready</p>
          <p className="mode-empty-body">
            This mode needs titles with cover images in the catalog.
          </p>
        </section>
      ) : (
        <div className="shell">
          <section className="play-top">
            <CoverClue
              imageUrl={coverUrl}
              manhwaId={answer.id}
              dateKey={isPractice ? `${dateKey}:practice:${answer.id}` : dateKey}
              seedPrefix={focusSeed}
              failedGuesses={failedGuesses}
              finished={finished}
              maxGuesses={maxGuesses}
            />
            <div className="character-test-bar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={tryAnotherCover}
              >
                Guess another cover
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
                {showResult
                  ? 'Show result again'
                  : `Show answer — ${displayTitle(answer)}`}
              </button>
            )}
          </aside>

          <section className="play-bottom">
            <FeedbackGrid rows={feedbackRows} />
          </section>
        </div>
      )}

      {hasCovers && coverUrl && (
        <ResultModal
          open={showResult}
          won={dayState.status === 'won'}
          answer={answer}
          guessCount={dayState.guessIds.length}
          maxGuesses={maxGuesses}
          shareText={shareText}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  )
}
