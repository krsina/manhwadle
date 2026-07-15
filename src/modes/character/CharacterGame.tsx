import { useEffect, useMemo, useState } from 'react'
import { AuthButton } from '../../components/AuthButton'
import { useAuth } from '../../components/AuthProvider'
import { CharacterClue } from '../../components/CharacterClue'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { GuessInput } from '../../components/GuessInput'
import { HowToPlay } from '../../components/howto/HowToPlay'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { StatsButton } from '../../components/StatsButton'
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
import { displayTitle, getTodayKey } from '../../lib/daily'
import { hasSeenHowTo } from '../../lib/howto'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import { applyGuess } from '../../lib/guessLoop'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { catalogSizePhrase } from '../../lib/catalogConfig'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { characterModeMeta } from './config'

const cropsByManhwa = groupCropsByManhwa(characterCropData as CharacterCropFile)

function buildFeedbackRows(state: DayState, answer: Manhwa, pool: Manhwa[]): GuessFeedback[] {
  return state.guessIds
    .map((id) => findById(pool, id))
    .filter((m): m is Manhwa => Boolean(m))
    .map((guess) => compareGuess(guess, answer))
}

/** Character mode: progressive zoom-out on a curated character still. */
export function CharacterGame({ pool, guessPool, taste }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline, howTo } =
    characterModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const dateKey = getTodayKey()
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  const playablePool = useMemo(
    () =>
      pool.filter(
        (m) => manhwaHasGuessableCharacter(m) || cropsByManhwa.has(m.id),
      ),
    [pool],
  )

  const hasCrops = playablePool.length > 0

  const { answer: dailyAnswer } = useDailyPuzzleAnswer(
    'character',
    taste,
    playablePool,
    pool,
    tasteSeed,
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
        tasteSeed,
        cropsByManhwa.get(answer.id) ?? [],
      ),
    [answer, dateKey, tasteSeed, isPractice],
  )

  const revealCharacter = useMemo(() => {
    if (!crop?.characterId) return null
    const found =
      (answer.characters || []).find((character) => character.id === crop.characterId) || null
    if (!found) return null
    const cropName = crop.characterName?.trim()
    if (!cropName) return found
    const known = new Set(
      [found.name.full, found.name.native, ...(found.name.alternative || [])]
        .filter(Boolean)
        .map((name) => name!.trim().toLowerCase()),
    )
    if (known.has(cropName.toLowerCase())) return found
    return {
      ...found,
      name: {
        ...found.name,
        alternative: [...(found.name.alternative || []), cropName],
      },
    }
  }, [answer, crop])

  const [dayState, setDayState] = useState<DayState>(() => {
    if (!hasCrops) {
      return createInitialState(dateKey, dailyAnswer.id)
    }
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id)
  })

  useEffect(() => {
    if (!hasCrops || isPractice) return
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
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, hasCrops])

  const [showResult, setShowResult] = useState(
    () =>
      hasCrops &&
      (dayState.status === 'won' || dayState.status === 'lost') &&
      hasSeenHowTo(id),
  )

  const feedbackRows = useMemo(
    () => (hasCrops ? buildFeedbackRows(dayState, answer, guessPool) : []),
    [hasCrops, dayState, answer, guessPool],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])
  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = maxGuesses - dayState.guessIds.length
  const finished = dayState.status !== 'playing'

  const failedGuesses =
    dayState.status === 'won'
      ? Math.max(0, dayState.guessIds.length - 1)
      : dayState.guessIds.length

  const firstTryWin =
    dayState.status === 'won' && dayState.guessIds.length === 1
  const doubleSolve =
    firstTryWin && dayState.bonusNameCorrect === true

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
      bonusCorrect:
        dayState.bonusNameGuess != null ? Boolean(dayState.bonusNameCorrect) : null,
      doubleSolve,
    })
  }, [feedbackRows, dateKey, dayState, maxGuesses, name, taste, doubleSolve])

  function handleGuess(manhwa: Manhwa) {
    if (!hasCrops) return
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
    // Practice rounds stay in-memory so today's daily progress is preserved.
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      sync.progress('character', taste, next)
      if (won || lost) {
        recordDailyResult({
          modeId: 'character',
          taste,
          dateKey,
          maxGuesses,
          won,
          guessCount: transition.guessIds.length,
        })
        sync.stats('character', taste)
      }
    }
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

  function handleBonusNameAnswer(result: { guess: string; correct: boolean }) {
    if (dayState.bonusNameGuess != null) return

    const firstTryWin = dayState.status === 'won' && dayState.guessIds.length === 1
    const isDoubleSolve = result.correct && firstTryWin
    const next: DayState = {
      ...dayState,
      bonusNameGuess: result.guess,
      bonusNameCorrect: result.correct,
    }

    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      sync.progress('character', taste, next)
      recordBonusResult({
        modeId: 'character',
        taste,
        dateKey,
        maxGuesses,
        correct: result.correct,
        doubleSolve: isDoubleSolve,
      })
      sync.stats('character', taste)
    }
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
              modeId="character"
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
            then this daily mode will unlock for the {catalogSizePhrase()}.
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

      {hasCrops && crop && (
        <ResultModal
          open={showResult}
          won={dayState.status === 'won'}
          answer={answer}
          guessCount={dayState.guessIds.length}
          maxGuesses={maxGuesses}
          shareText={shareText}
          onClose={() => setShowResult(false)}
          revealCharacter={revealCharacter}
          characterImageUrlOverride={crop.imageUrl}
          bonusCharacter={dayState.status === 'won' ? revealCharacter : null}
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
        />
      )}
    </>
  )
}
