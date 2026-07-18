import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { CharacterClue } from '../../components/CharacterClue'
import { FeedbackGrid } from '../../components/FeedbackGrid'
import { FilterToggle } from '../../components/FilterToggle'
import { GuessInput } from '../../components/GuessInput'
import { HardModeToggle } from '../../components/HardModeToggle'
import { KnownInfoPanel } from '../../components/KnownInfoPanel'
import { ResultModal } from '../../components/ResultModal'
import { SurrenderModal } from '../../components/SurrenderModal'
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
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
import { catalogSizePhrase } from '../../lib/catalogConfig'
import { useDailyPuzzleAnswer } from '../../lib/useDailyPuzzleAnswer'
import type { GameModeProps } from '../types'
import { characterModeMeta } from './config'

const cropsByManhwa = groupCropsByManhwa(characterCropData as CharacterCropFile)

const HARD_MODE_STORAGE_KEY = 'manhwadle:character:hard-mode'

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

/** Character mode: progressive zoom-out on a curated character still. */
export function CharacterGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    characterModeMeta
  const { user } = useAuth()
  const sync = syncAfterLocalChange(user?.id)
  const isArchive = isArchiveDate(dateKey)
  const tasteSeed = withTastePrefix(seedPrefix, taste)
  const tasteStorage = withTastePrefix(storagePrefix, taste)

  const [hardMode, setHardMode] = useState(() => {
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved?.hardMode != null) return saved.hardMode
    if (saved && saved.guessIds.length > 0) return false
    return loadHardModePreference()
  })

  /** Hard mode is forced B&W; color can be unlocked on the last guess. */
  const [colorEnabled, setColorEnabled] = useState(false)

  const playablePool = useMemo(
    () => pool.filter((m) => manhwaHasGuessableCharacter(m, { mainOnly: true })),
    [pool],
  )

  const hasCrops = playablePool.length > 0
  /** Same daily title for normal/hard; hard only changes which cast member is shown. */
  const charSeed = hardMode ? `${tasteSeed}:hard` : tasteSeed

  const { answer: dailyAnswer, characterId: remoteCharacterId } =
    useDailyPuzzleAnswer(
      'character',
      taste,
      playablePool,
      pool,
      tasteSeed,
      dateKey,
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
        charSeed,
        cropsByManhwa.get(answer.id) ?? [],
        {
          mainOnly: !hardMode,
          preferredCharacterId: isPractice ? null : remoteCharacterId,
        },
      ),
    [answer, dateKey, charSeed, isPractice, hardMode, remoteCharacterId],
  )

  const revealCharacter = useMemo(() => {
    if (!crop?.characterId) return null
    const found =
      (answer.characters || []).find((character) => character.id === crop.characterId) ||
      null
    if (!found) return null
    const cropName = crop.characterName?.trim()
    if (!cropName) return found
    const known = new Set(
      [found.name.full, found.name.native, ...(found.name.alternative || [])]
        .filter(Boolean)
        .map((n) => n!.trim().toLowerCase()),
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
      return createInitialState(dateKey, dailyAnswer.id, {
        hardMode: loadHardModePreference(),
      })
    }
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) return saved
    return createInitialState(dateKey, dailyAnswer.id, {
      hardMode: loadHardModePreference(),
    })
  })

  const [showResult, setShowResult] = useState(
    () =>
      hasCrops &&
      (dayState.status === 'won' || dayState.status === 'lost') &&
      hasSeenHowTo(id),
  )
  const [showSurrender, setShowSurrender] = useState(false)

  useEffect(() => {
    if (!hasCrops || isPractice) return
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
    setShowSurrender(false)
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, hasCrops, id])

  const hardModeLocked = dayState.guessIds.length > 0

  function handleHardModeChange(next: boolean) {
    if (hardModeLocked) return
    saveHardModePreference(next)
    setHardMode(next)
    setColorEnabled(false)
    setPracticeIndex(null)
    setDayState((prev) => {
      const updated = {
        ...prev,
        answerId: dailyAnswer.id,
        hardMode: next,
      }
      if (!isPractice) saveDayState(updated, tasteStorage)
      return updated
    })
  }

  const feedbackRows = useMemo(
    () => (hasCrops ? buildFeedbackRows(dayState, answer, guessPool) : []),
    [hasCrops, dayState, answer, guessPool],
  )

  const knownInfo = useMemo(() => buildKnownInfo(feedbackRows), [feedbackRows])
  const excludedIds = useMemo(() => new Set(dayState.guessIds), [dayState.guessIds])
  const remaining = maxGuesses - dayState.guessIds.length
  const finished = dayState.status !== 'playing'
  const surrendered =
    dayState.status === 'lost' && dayState.guessIds.length < maxGuesses
  const canUnlockColor = hardMode && !finished && remaining === 1
  const colorToggleLocked = hardMode && !canUnlockColor
  const grayscale = hardMode && !colorEnabled

  const progress = clueProgress(dayState)
  const maxClueStep = Math.max(0, maxGuesses - 1)
  const canRevealMore = canAdvanceClue(dayState, maxClueStep)

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
      hintsUsed: dayState.hintsUsed ?? 0,
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

  function persistDay(next: DayState) {
    setDayState(next)
    if (!isPractice) {
      saveDayState(next, tasteStorage)
      if (!isArchive) sync.progress('character', taste, next)
    }
  }

  function handleRevealMore() {
    const next = advanceClue(dayState, maxClueStep)
    if (!next) return
    persistDay(next)
  }

  function handleSurrender() {
    if (!hasCrops || dayState.status !== 'playing') return
    setShowSurrender(false)
    const next: DayState = {
      ...dayState,
      answerId: answer.id,
      status: 'lost',
      hardMode,
    }
    persistDay(next)
    if (!isPractice && !isArchive) {
      recordDailyResult({
        modeId: 'character',
        taste,
        dateKey,
        maxGuesses,
        won: false,
        guessCount: dayState.guessIds.length,
        hintsUsed: next.hintsUsed ?? 0,
      })
      sync.stats('character', taste)
    }
    setShowResult(true)
  }

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
    if (!hasCrops) return
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
    if (!isPractice && !isArchive && (won || lost)) {
      recordDailyResult({
        modeId: 'character',
        taste,
        dateKey,
        maxGuesses,
        won,
        guessCount: transition.guessIds.length,
        hintsUsed: next.hintsUsed ?? 0,
      })
      sync.stats('character', taste)
    }
    if (won || lost) setShowResult(true)
  }

  function tryAnotherCharacter() {
    if (!hasCrops || playablePool.length === 0) return
    const nextIndex = randomPlayableIndex(playablePool, answer.id)
    const nextAnswer = playablePool[nextIndex]!
    setPracticeIndex(nextIndex)
    setDayState(createInitialState(dateKey, nextAnswer.id, { hardMode }))
    setColorEnabled(false)
    setShowResult(false)
    setShowSurrender(false)
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
              {!hasCrops
                ? 'No crops yet'
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
            <div className="clue-stack clue-stack-overlap">
              <div className="clue-toolbar">
                <button
                  type="button"
                  className="surrender-toggle"
                  disabled={finished}
                  onClick={() => {
                    if (finished) return
                    setShowSurrender(true)
                  }}
                >
                  I give up
                </button>
                {hardMode && (
                  <FilterToggle
                    enabled={colorEnabled}
                    disabled={colorToggleLocked}
                    onChange={setColorEnabled}
                    label="Color"
                    titleOn="Color on"
                    titleOff="Show color"
                    titleLocked="Unlocks on the last guess"
                  />
                )}
                <HardModeToggle
                  enabled={hardMode}
                  disabled={hardModeLocked}
                  onChange={handleHardModeChange}
                  titleOn="Black and white"
                  titleOff="Black and white"
                />
              </div>
              <CharacterClue
                crop={crop}
                failedGuesses={progress}
                finished={finished}
                maxGuesses={maxGuesses}
                canRevealMore={canRevealMore}
                onRevealMore={handleRevealMore}
                grayscale={grayscale}
              />
            </div>
            {(import.meta.env.DEV || (isArchive && !isPractice)) && (
              <div className="character-test-bar">
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={tryAnotherCharacter}
                  >
                    Guess another character
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

      {hasCrops && crop && (
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
            isArchive={isArchive}
            surrendered={surrendered}
          />
        </>
      )}
    </>
  )
}
