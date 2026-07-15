import { useMemo, useState } from 'react'
import { CharacterClue } from '../../components/CharacterClue'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HowToPlay } from '../../components/howto/HowToPlay'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { ThemeToggle } from '../../components/ThemeToggle'
import { APP_NAME } from '../../brand'
import characterCropData from '../../data/characterCrop.json'
import type { DayState, GuessFeedback, Manhwa } from '../../lib/anilist-types'
import {
  buildShareText,
  compareGuess,
  feedbackToShareLine,
} from '../../lib/compare'
import {
  groupCropsByManhwa,
  manhwaHasGuessableCharacter,
  resolveDailyCharacterCrop,
  type CharacterCropFile,
} from '../../lib/crops'
import { displayTitle, getDailyAnswer, getTodayKey } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { findById } from '../../lib/search'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import type { GameModeProps } from '../types'
import { characterModeMeta } from './config'

const cropsByManhwa = groupCropsByManhwa(characterCropData as CharacterCropFile)

function buildFeedbackRows(state: DayState, answer: Manhwa, pool: Manhwa[]): GuessFeedback[] {
  return state.guessIds
    .map((id) => findById(pool, id))
    .filter((m): m is Manhwa => Boolean(m))
    .map((guess) => compareGuess(guess, answer))
}

function randomPlayableIndex(pool: Manhwa[], avoidId?: number): number {
  if (pool.length === 0) return 0
  if (pool.length === 1) return 0
  let next = Math.floor(Math.random() * pool.length)
  if (avoidId != null && pool[next]?.id === avoidId) {
    next = (next + 1) % pool.length
  }
  return next
}

/** Character mode: progressive zoom-out on a curated character still. */
export function CharacterGame({ pool }: GameModeProps) {
  const { id, seedPrefix, storagePrefix, maxGuesses, tagline, howTo } = characterModeMeta
  const dateKey = getTodayKey()

  const playablePool = useMemo(
    () =>
      pool.filter(
        (m) => manhwaHasGuessableCharacter(m) || cropsByManhwa.has(m.id),
      ),
    [pool],
  )

  const hasCrops = playablePool.length > 0

  const dailyAnswer = useMemo(
    () =>
      hasCrops
        ? getDailyAnswer(playablePool, dateKey, seedPrefix)
        : pool[0]!,
    [hasCrops, playablePool, pool, dateKey, seedPrefix],
  )

  /** When set, play a random practice title instead of today's answer (not persisted). */
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const answer =
    practiceIndex != null ? playablePool[practiceIndex] ?? dailyAnswer : dailyAnswer
  const isPractice = practiceIndex != null

  const crop = useMemo(
    () =>
      resolveDailyCharacterCrop(
        answer,
        isPractice ? `${dateKey}:practice:${answer.id}` : dateKey,
        seedPrefix,
        cropsByManhwa.get(answer.id) ?? [],
      ),
    [answer, dateKey, seedPrefix, isPractice],
  )

  const [dayState, setDayState] = useState<DayState>(() => {
    if (!hasCrops) {
      return createInitialState(dateKey, dailyAnswer.id)
    }
    const saved = loadDayState(dateKey, storagePrefix)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id)
  })

  const [showResult, setShowResult] = useState(
    () =>
      hasCrops &&
      (dayState.status === 'won' || dayState.status === 'lost') &&
      hasSeenHowTo(id),
  )

  const feedbackRows = useMemo(
    () => (hasCrops ? buildFeedbackRows(dayState, answer, pool) : []),
    [hasCrops, dayState, answer, pool],
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
    return buildShareText(
      `${APP_NAME} Character`,
      dateKey,
      dayState.guessIds.length,
      maxGuesses,
      dayState.status === 'won',
      lines,
    )
  }, [feedbackRows, dateKey, dayState, maxGuesses])

  function handleGuess(manhwa: Manhwa) {
    if (!hasCrops || dayState.status !== 'playing') return
    if (dayState.guessIds.includes(manhwa.id)) return

    const nextGuesses = [...dayState.guessIds, manhwa.id]
    const won = manhwa.id === answer.id
    const lost = !won && nextGuesses.length >= maxGuesses
    const next: DayState = {
      ...dayState,
      answerId: answer.id,
      guessIds: nextGuesses,
      status: won ? 'won' : lost ? 'lost' : 'playing',
    }

    setDayState(next)
    // Practice rounds stay in-memory so today's daily progress is preserved.
    if (!isPractice) saveDayState(next, storagePrefix)
    if (won || lost) setShowResult(true)
  }

  function tryAnotherCharacter() {
    if (!hasCrops || playablePool.length === 0) return
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
            <ThemeToggle />
          </div>
          <p className="day-meta">
            <span>{dateKey}</span>
            <span aria-hidden="true">·</span>
            <span>
              {!hasCrops
                ? 'No crops yet'
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

      {!hasCrops || !crop ? (
        <section className="mode-empty">
          <p className="mode-empty-title">Character crops not ready</p>
          <p className="mode-empty-body">
            Enable character images in the{' '}
            <a href="/library.html">library editor</a> (cast is included by default),
            then this daily mode will unlock for the top 500.
          </p>
        </section>
      ) : (
        <div className="shell">
          <section className="play-top">
            <CharacterClue
              crop={crop}
              failedGuesses={failedGuesses}
              finished={finished}
              maxGuesses={maxGuesses}
            />
            <div className="character-test-bar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={tryAnotherCharacter}
              >
                Guess another character
              </button>
              {isPractice && (
                <p className="character-test-note">
                  Practice round — does not overwrite today’s daily save.
                </p>
              )}
            </div>
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
      )}

      {hasCrops && crop && (
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
