import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useOwnerDevAccess } from '../../lib/useOwnerDevAccess'
import { buildKnownInfo } from '../../lib/knowledge'
import { randomPlayableIndex } from '../../lib/random'
import { findById } from '../../lib/search'
import {
  advanceClue,
  canAdvanceClue,
  clueProgress,
} from '../../lib/clueProgress'
import { applyGuess } from '../../lib/guessLoop'
import { reportWrongGenreIfCompleteMiss } from '../../lib/secretEvents'
import { createInitialState, loadDayState, saveDayState } from '../../lib/storage'
import { readerTasteShareLabel, withTastePrefix } from '../../lib/readerTaste'
import {
  applyRankedCompletionReward,
  isSurrenderedLoss,
  queueBonusNameReward,
  queueVerifiedDailyCompletion,
  shouldUseServerRankedAttempt,
  submitRankedDailyGuess,
} from '../../lib/ranked'
import { recordBonusResult, recordDailyResult } from '../../lib/stats'
import { syncAfterLocalChange } from '../../lib/sync'
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

/** Character mode: full portrait by default; Hard Mode keeps progressive zoom-out. */
export function CharacterGame({ pool, guessPool, taste, dateKey }: GameModeProps) {
  const { id: _id, name, seedPrefix, storagePrefix, maxGuesses, tagline } =
    characterModeMeta
  const { user } = useAuth()
  const { ownerDev } = useOwnerDevAccess()
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

  const {
    answer: dailyAnswer,
    settled: answerSettled,
    migrationMissing,
    clue,
    rankedClueReady,
  } = useDailyPuzzleAnswer(
      'character',
      taste,
      playablePool,
      pool,
      tasteSeed,
      dateKey,
      Boolean(!isArchive),
    )

  /** When set, play a random practice title instead of today's answer (not persisted). */
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const [rankedReveal, setRankedReveal] = useState<{
    answerId: number
    characterId: number | null
  } | null>(null)
  const [forcedLocalOnly, setForcedLocalOnly] = useState(false)
  const forcedLocalOnlyRef = useRef(false)
  const rankedRevealedAnswer =
    rankedReveal != null ? findById(playablePool, rankedReveal.answerId) : null
  const answer =
    practiceIndex != null
      ? playablePool[practiceIndex] ?? dailyAnswer
      : rankedRevealedAnswer ?? dailyAnswer
  const isPractice = practiceIndex != null
  const wantsRanked = shouldUseServerRankedAttempt({
    userId: user?.id,
    isPractice,
    isArchive,
  })
  const localOnlyToday = wantsRanked && (migrationMissing || forcedLocalOnly)
  const rankedPayloadMissing = wantsRanked && !migrationMissing && !rankedClueReady
  const answerReady = isPractice || (answerSettled && !rankedPayloadMissing)

  const crop = useMemo(
    () => {
      if (
        !isPractice &&
        !rankedReveal &&
        clue?.type === 'character' &&
        typeof clue.image_url === 'string'
      ) {
        return {
          manhwaId: 0,
          imageUrl: clue.image_url,
          focusX: typeof clue.focus_x === 'number' ? clue.focus_x : 50,
          focusY: typeof clue.focus_y === 'number' ? clue.focus_y : 28,
        }
      }
      return resolveDailyCharacterCrop(
        answer,
        isPractice ? `${dateKey}:practice:${answer.id}` : dateKey,
        charSeed,
        cropsByManhwa.get(answer.id) ?? [],
        {
          mainOnly: !hardMode,
          preferredCharacterId: isPractice ? null : rankedReveal?.characterId ?? null,
        },
      )
    },
    [answer, dateKey, charSeed, isPractice, hardMode, rankedReveal, clue],
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
      hasCrops && (dayState.status === 'won' || dayState.status === 'lost'),
  )
  const [showSurrender, setShowSurrender] = useState(false)

  useEffect(() => {
    if (!hasCrops || isPractice || !answerSettled) return
    const saved = loadDayState(dateKey, tasteStorage)
    if (saved && saved.answerId === dailyAnswer.id) {
      setDayState(saved)
      if (saved.hardMode != null) setHardMode(saved.hardMode)
      else if (saved.guessIds.length > 0) setHardMode(false)
      else setHardMode(loadHardModePreference())
      setShowResult(saved.status === 'won' || saved.status === 'lost')
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
  }, [dailyAnswer.id, dateKey, tasteStorage, isPractice, hasCrops, answerSettled])

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
  const canRevealMore = answerReady && canAdvanceClue(dayState, maxClueStep)

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
    if (!isPractice && answerReady) {
      saveDayState(next, tasteStorage)
      if (
        !isArchive &&
        !localOnlyToday &&
        !forcedLocalOnlyRef.current &&
        (!wantsRanked || (next.status !== 'playing' && next.answerId > 0))
      ) {
        sync.progress('character', taste, next)
      }
    }
  }

  function submitTerminal(
    next: DayState,
    won: boolean,
    surrendered: boolean,
    opts: { rankedAlreadyFinalized?: boolean } = {},
  ) {
    if (isPractice || isArchive) return
    if (localOnlyToday || forcedLocalOnlyRef.current) return
    recordDailyResult({
      modeId: 'character',
      taste,
      dateKey,
      maxGuesses,
      won,
      guessCount: next.guessIds.length,
      hintsUsed: next.hintsUsed ?? 0,
    })
    sync.stats('character', taste)
    if (opts.rankedAlreadyFinalized) return
    queueVerifiedDailyCompletion({
      userId: user?.id,
      isPractice,
      isArchive,
      mode: 'character',
      taste,
      guessIds: next.guessIds,
      hintsUsed: next.hintsUsed ?? 0,
      hardMode: Boolean(next.hardMode ?? hardMode),
      surrendered,
      dateKey,
      onResult: (result) => {
        if (result.status === 'ok' && result.answerId != null) {
          setRankedReveal({
            answerId: result.answerId,
            characterId: result.characterId,
          })
        }
      },
    })
  }

  function handleRevealMore() {
    if (!answerReady) return
    const next = advanceClue(dayState, maxClueStep)
    if (!next) return
    persistDay(next)
  }

  function handleSurrender() {
    if (!answerReady || !hasCrops || dayState.status !== 'playing') return
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

  function applyLocalGuess(manhwa: Manhwa, matchedLabel?: string) {
    const transition = applyGuess(dayState, manhwa.id, answer.id, maxGuesses)
    if (!transition) return
    reportWrongGenreIfCompleteMiss(manhwa, answer)
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

  function handleGuess(manhwa: Manhwa, matchedLabel?: string) {
    if (!answerReady || !hasCrops || dayState.status !== 'playing') return

    const useServer =
      shouldUseServerRankedAttempt({
        userId: user?.id,
        isPractice,
        isArchive,
      }) && !migrationMissing

    if (!useServer) {
      applyLocalGuess(manhwa, matchedLabel)
      return
    }

    void (async () => {
      const ranked = await submitRankedDailyGuess({
        userId: user?.id,
        isPractice,
        isArchive,
        mode: 'character',
        taste,
        guessId: manhwa.id,
        hintsUsed: dayState.hintsUsed ?? 0,
        hardMode,
        dateKey,
      })

      if (ranked.status === 'skipped' && ranked.reason === 'migration_missing') {
        forcedLocalOnlyRef.current = true
        setForcedLocalOnly(true)
        applyLocalGuess(manhwa, matchedLabel)
        return
      }
      if (ranked.status !== 'ok' || !ranked.accepted) {
        if (ranked.status === 'error') {
          console.warn('[ranked]', ranked.warning, ranked.message)
        }
        return
      }

      reportWrongGenreIfCompleteMiss(manhwa, answer)
      const priorLabels = dayState.guessLabels ?? []
      const guessLabels = [
        ...dayState.guessIds.map((_, i) => priorLabels[i] || ''),
        matchedLabel?.trim() || displayTitle(manhwa),
      ]
      const revealedAnswerId = ranked.answerId ?? answer.id
      if (ranked.answerId != null) {
        setRankedReveal({
          answerId: ranked.answerId,
          characterId: ranked.characterId,
        })
      }
      const next: DayState = {
        ...dayState,
        answerId: revealedAnswerId,
        guessIds: ranked.guessIds,
        guessLabels,
        status: ranked.dayStatus,
        hardMode,
      }
      persistDay(next)
      if (ranked.finalized) {
        if (ranked.completion) applyRankedCompletionReward(ranked.completion)
        submitTerminal(
          next,
          ranked.dayStatus === 'won',
          isSurrenderedLoss(ranked.dayStatus, ranked.guessIds.length, maxGuesses),
          { rankedAlreadyFinalized: true },
        )
        setShowResult(true)
      }
    })()
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

  function handleBonusNameAnswer(result: {
    guess: string
    correct: boolean
    guessedCharacterId?: number
    guessLabel?: string
  }) {
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
      if (!isArchive && !localOnlyToday) {
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
        if (result.guessedCharacterId != null && result.guessedCharacterId > 0) {
          queueBonusNameReward({
            userId: user?.id,
            isPractice,
            isArchive,
            mode: 'character',
            taste,
            correct: result.correct,
            firstTry,
            guessedCharacterId: result.guessedCharacterId,
            guessLabel: result.guessLabel ?? result.guess,
            dateKey,
          })
        }
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
          {localOnlyToday && (
            <p className="day-meta" role="status">
              Local-only play — ranked sync is unavailable until the security migration is deployed.
            </p>
          )}
          {rankedPayloadMissing && (
            <p className="day-meta" role="alert">
              Ranked puzzle unavailable: the server has no clue-safe metadata for today.
            </p>
          )}
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
                      : surrendered
                        ? 'Gave up'
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
            then this daily mode will unlock for the catalog.
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
                {hardMode && (
                  <FilterToggle
                    enabled={colorEnabled}
                    disabled={!answerReady || colorToggleLocked}
                    onChange={setColorEnabled}
                    label="Color"
                    titleOn="Color on"
                    titleOff="Show color"
                    titleLocked="Unlocks on the last guess"
                  />
                )}
                <HardModeToggle
                  enabled={hardMode}
                  disabled={!answerReady || hardModeLocked}
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
                progressiveZoom={hardMode}
                canRevealMore={hardMode && canRevealMore}
                onRevealMore={hardMode ? handleRevealMore : undefined}
                grayscale={grayscale}
              />
            </div>
            {(ownerDev || (isArchive && !isPractice)) && (
              <div className="character-test-bar">
                {ownerDev && (
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
                {ownerDev && isPractice && (
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
              disabledPlaceholder={
                surrendered ? 'You gave up — round over' : undefined
              }
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
