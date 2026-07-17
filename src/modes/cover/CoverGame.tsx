import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { CoverClue } from '../../components/CoverClue'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
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
import { manhwaHasCover } from '../../lib/cover'
import { isArchiveDate } from '../../lib/archive'
import { displayTitle } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { coverModeMeta } from './config'

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

/** Cover mode: progressive zoom-out on the daily title's cover art. */
export function CoverGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    coverModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const isArchive = isArchiveDate(dateKey)
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
    dateKey,
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
    })
  }, [shareLines, dateKey, dayState, maxGuesses, name, taste, doubleSolve, isArchive])

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
    if (!hasCovers) return
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
    }
    const won = transition.status === 'won'
    const lost = transition.status === 'lost'

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      if (!isArchive) {
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
        sync.progress('cover', taste, next)
        recordBonusResult({
          modeId: 'cover',
          taste,
          dateKey,
          maxGuesses,
          correct: result.correct,
          doubleSolve: isDoubleSolve,
        })
        sync.stats('cover', taste)
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
              {!hasCovers
                ? 'No covers'
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
            {(import.meta.env.DEV || (isArchive && !isPractice)) && (
              <div className="character-test-bar">
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={tryAnotherCover}
                  >
                    Guess another cover
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
      )}

      {hasCovers && coverUrl && (
        <ResultModal
          open={showResult}
          won={dayState.status === 'won'}
          answer={answer}
          guessCount={dayState.guessIds.length}
          maxGuesses={maxGuesses}
          shareText={shareText}
          shareLines={shareLines}
          modeId="cover"
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
      )}
    </>
  )
}
