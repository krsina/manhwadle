import { useMemo, useState } from 'react'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HowToPlay } from '../../components/howto/HowToPlay'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
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
import { displayTitle, getDailyAnswer, getTodayKey } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { findById } from '../../lib/search'
import { scrubSummary } from '../../lib/spoiler'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
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
export function SummaryGame({ pool }: GameModeProps) {
  const { id, seedPrefix, storagePrefix, maxGuesses, tagline, howTo } = summaryModeMeta
  const dateKey = getTodayKey()

  // Daily answers only from titles that have authored story blurbs
  const playablePool = useMemo(
    () => pool.filter((m) => storyBlurbIndex.has(m.id)),
    [pool],
  )

  const answer = useMemo(
    () => getDailyAnswer(playablePool.length > 0 ? playablePool : pool, dateKey, seedPrefix),
    [playablePool, pool, dateKey, seedPrefix],
  )

  const blurbs = useMemo(() => {
    const authored = storyBlurbIndex.get(answer.id)
    const full = scrubSummary(answer)
    return buildRevealLadder(authored, full)
  }, [answer])

  const [dayState, setDayState] = useState<DayState>(() => {
    const saved = loadDayState(dateKey, storagePrefix)
    if (saved && saved.answerId === answer.id) return saved
    return createInitialState(dateKey, answer.id)
  })

  const [showResult, setShowResult] = useState(
    () =>
      (dayState.status === 'won' || dayState.status === 'lost') && hasSeenHowTo(id),
  )

  const feedbackRows = useMemo(
    () => buildFeedbackRows(dayState, answer, pool),
    [dayState, answer, pool],
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
    return buildShareText(
      APP_NAME,
      dateKey,
      dayState.guessIds.length,
      maxGuesses,
      dayState.status === 'won',
      lines,
    )
  }, [feedbackRows, dateKey, dayState, maxGuesses])

  function handleGuess(manhwa: Manhwa) {
    if (dayState.status !== 'playing') return
    if (dayState.guessIds.includes(manhwa.id)) return

    const nextGuesses = [...dayState.guessIds, manhwa.id]
    const won = manhwa.id === answer.id
    const lost = !won && nextGuesses.length >= maxGuesses
    const next: DayState = {
      ...dayState,
      guessIds: nextGuesses,
      status: won ? 'won' : lost ? 'lost' : 'playing',
    }

    setDayState(next)
    saveDayState(next, storagePrefix)
    if (won || lost) setShowResult(true)
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
            <ThemeToggle />
          </div>
          <p className="day-meta">
            <span>{dateKey}</span>
            <span aria-hidden="true">·</span>
            <span>
              {finished
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
          <GuessInput
            pool={pool}
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
