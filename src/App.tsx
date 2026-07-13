import { useMemo, useState } from 'react'
import manhwaData from './data/manhwa.json'
import { FeedbackGrid } from './components/FeedbackGrid'
import { GuessInput } from './components/GuessInput'
import { KnownInfoPanel } from './components/KnownInfoPanel'
import { ResultModal } from './components/ResultModal'
import { SummaryClue } from './components/SummaryClue'
import type { DayState, GuessFeedback, Manhwa } from './lib/anilist-types'
import {
  buildShareText,
  compareGuess,
  feedbackToShareLine,
} from './lib/compare'
import { displayTitle, getDailyAnswer, getTodayKey } from './lib/daily'
import { buildKnownInfo } from './lib/knowledge'
import { findById } from './lib/search'
import { scrubSummary } from './lib/spoiler'
import { createInitialState, loadDayState, saveDayState } from './lib/storage'
import './styles.css'

const MAX_GUESSES = 6
const pool = manhwaData as Manhwa[]

function buildFeedbackRows(state: DayState, answer: Manhwa): GuessFeedback[] {
  return state.guessIds
    .map((id) => findById(pool, id))
    .filter((m): m is Manhwa => Boolean(m))
    .map((guess) => compareGuess(guess, answer))
}

function App() {
  const dateKey = getTodayKey()
  const answer = useMemo(() => getDailyAnswer(pool, dateKey), [dateKey])
  const clue = useMemo(() => scrubSummary(answer), [answer])

  const [dayState, setDayState] = useState<DayState>(() => {
    const saved = loadDayState(dateKey)
    if (saved && saved.answerId === answer.id) return saved
    return createInitialState(dateKey, answer.id)
  })

  const [showResult, setShowResult] = useState(
    () => dayState.status === 'won' || dayState.status === 'lost',
  )

  const feedbackRows = useMemo(
    () => buildFeedbackRows(dayState, answer),
    [dayState, answer],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])

  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = MAX_GUESSES - dayState.guessIds.length
  const finished = dayState.status !== 'playing'

  const shareText = useMemo(() => {
    const lines = feedbackRows.map(feedbackToShareLine)
    return buildShareText(
      dateKey,
      dayState.guessIds.length,
      MAX_GUESSES,
      dayState.status === 'won',
      lines,
    )
  }, [feedbackRows, dateKey, dayState])

  function handleGuess(manhwa: Manhwa) {
    if (dayState.status !== 'playing') return
    if (dayState.guessIds.includes(manhwa.id)) return

    const nextGuesses = [...dayState.guessIds, manhwa.id]
    const won = manhwa.id === answer.id
    const lost = !won && nextGuesses.length >= MAX_GUESSES
    const next: DayState = {
      ...dayState,
      guessIds: nextGuesses,
      status: won ? 'won' : lost ? 'lost' : 'playing',
    }

    setDayState(next)
    saveDayState(next)
    if (won || lost) setShowResult(true)
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <header className="hero">
        <div className="hero-copy">
          <p className="brand">ManhwaGuessr</p>
          <p className="tagline">Guess today’s manhwa from the summary.</p>
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
      </header>

      <div className="shell">
        <section className="play-top">
          <SummaryClue text={clue} />
          <GuessInput
            pool={pool}
            disabled={finished}
            excludedIds={excludedIds}
            onGuess={handleGuess}
          />
        </section>

        <aside className="side-rail" aria-label="Clue dossier">
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

      <footer className="footer">
        <p>
          Data from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . Top 250 Korean manhwa by popularity.
        </p>
      </footer>

      <ResultModal
        open={showResult}
        won={dayState.status === 'won'}
        answer={answer}
        guessCount={dayState.guessIds.length}
        maxGuesses={MAX_GUESSES}
        shareText={shareText}
        onClose={() => setShowResult(false)}
      />
    </div>
  )
}

export default App
