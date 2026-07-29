import { useEffect, useMemo, useState } from 'react'
import type { Manhwa, ManhwaCharacter } from '../lib/anilist-types'
import { characterImageUrl } from '../lib/anilist-types'
import { characterDisplayName } from '../lib/characterNames'
import { displayTitle, formatCountdown, msUntilNextUtcMidnight } from '../lib/daily'
import { formatGuessScore } from '../lib/compare'
import { collectCharacters } from '../lib/search'
import { nameOrderVariants, namesMatch } from '../lib/nameMatch'
import { BonusCelebrate } from './BonusCelebrate'
import { CharacterGuessInput } from './CharacterGuessInput'
import { ConfettiBurst } from './ConfettiBurst'
import { Dialog } from './Dialog'
import { ElectricBorder } from './ElectricBorder'
import { MediaImage } from './MediaImage'
import { playSolveCelebrationSound } from '../lib/solveCelebrationSounds'
import { playerLevelFromXp } from '../lib/playerLevel'
import {
  POINTS_AWARDED_EVENT,
  getLastPointsAwarded,
  type PointsAwardedDetail,
} from '../lib/ranked'
import { useAuth } from './AuthProvider'
import { reportSecretEvent } from '../lib/secretEvents'

export interface BonusNameResult {
  guess: string
  correct: boolean
  /** AniList character id submitted for server-side bonus validation. */
  guessedCharacterId?: number
  /** Label / alias text submitted alongside the character id. */
  guessLabel?: string
}

type ShareFeedback = 'idle' | 'copied' | 'shared'

interface ResultModalProps {
  open: boolean
  won: boolean
  answer: Manhwa
  guessCount: number
  maxGuesses: number
  /** Free hint reveals used this round */
  hintsUsed?: number
  hardMode?: boolean
  shareText: string
  onClose: () => void
  /** Emoji rows for the share mini-grid */
  shareLines?: string[]
  /** Character-mode: depicted cast member to reveal (win or loss) */
  revealCharacter?: ManhwaCharacter | null
  /** Prefer crop still over AniList portrait when set */
  characterImageUrlOverride?: string | null
  /** Ask for a character name after a win (depicted cast / series main) */
  bonusCharacter?: ManhwaCharacter | null
  /**
   * When set, any of these characters count as correct (e.g. all MAIN roles).
   * Defaults to `[bonusCharacter]` when omitted.
   */
  bonusAcceptCharacters?: ManhwaCharacter[]
  /** Bonus prompt copy; defaults to depicted-character wording */
  bonusPrompt?: string
  /** Catalog used to build the character-name autocomplete */
  characterGuessPool?: Manhwa[]
  /** Persisted one-shot bonus result, if already answered */
  bonusNameResult?: BonusNameResult | null
  onBonusNameAnswer?: (result: BonusNameResult) => void
  /** Historical puzzle — hide next-daily countdown */
  isArchive?: boolean
  /** Lost by surrender rather than using all guesses */
  surrendered?: boolean
}

function characterNameList(character: ManhwaCharacter): string[] {
  const base = [
    character.name.full,
    character.name.native,
    ...(character.name.alternative || []),
  ].filter((name): name is string => Boolean(name?.trim()))

  return base.flatMap((name) => nameOrderVariants(name))
}

/**
 * Bonus asks for the character's name. Accept the same AniList id, or a selected
 * autocomplete label that matches any of the answer character's names/aliases
 * (shared first names like "Emily" exist across different ids in the catalog).
 * Hyphens/spaces/merged forms match ("Mori Jin" ≡ "Mo-Ri Jin").
 */
function isBonusCharacterCorrect(
  guessed: ManhwaCharacter,
  answerCharacter: ManhwaCharacter,
  matchedLabel?: string,
): boolean {
  if (guessed.id === answerCharacter.id) return true

  const label = matchedLabel?.trim() || ''
  if (!label) return false

  return characterNameList(answerCharacter).some((name) => namesMatch(name, label))
}

export function ResultModal({
  open,
  won,
  answer,
  guessCount,
  maxGuesses,
  hintsUsed = 0,
  hardMode = false,
  shareText,
  onClose,
  shareLines = [],
  revealCharacter = null,
  characterImageUrlOverride = null,
  bonusCharacter = null,
  bonusAcceptCharacters,
  bonusPrompt = "What is the character's name?",
  characterGuessPool = [],
  bonusNameResult = null,
  onBonusNameAnswer,
  isArchive = false,
  surrendered = false,
}: ResultModalProps) {
  const { account } = useAuth()
  const [localBonus, setLocalBonus] = useState<BonusNameResult | null>(null)
  const [countdownMs, setCountdownMs] = useState(() => msUntilNextUtcMidnight())
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('idle')
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null)
  const [playXpAwarded, setPlayXpAwarded] = useState<number | null>(null)
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)

  const scoreLabel = formatGuessScore({
    won,
    guessCount,
    maxGuesses,
    hardMode,
    hintsUsed,
  })

  const acceptedBonusCharacters = useMemo(() => {
    if (bonusAcceptCharacters && bonusAcceptCharacters.length > 0) {
      return bonusAcceptCharacters
    }
    return bonusCharacter ? [bonusCharacter] : []
  }, [bonusAcceptCharacters, bonusCharacter])

  const bonusResult = bonusNameResult ?? localBonus
  const showBonus = Boolean(won && bonusCharacter)
  const bonusPending = showBonus && !bonusResult
  const bonusCorrect = bonusResult?.correct === true
  const firstTry = won && guessCount === 1
  const doubleSolve = firstTry && bonusCorrect
  const showCharacter = Boolean(revealCharacter)
  // Don't spoil the bonus: reveal the depicted name only after it's answered
  // (or on a loss, when there is no bonus).
  const showCharacterName = showCharacter && !bonusPending
  const characterNameText = showCharacterName
    ? characterDisplayName(revealCharacter!)
    : null

  const heroImage = showCharacter
    ? characterImageUrlOverride?.trim() ||
      characterImageUrl(revealCharacter!) ||
      null
    : answer.coverImage

  // Series stays the answer title; depicted cast name sits under it once revealed.
  const titleText = displayTitle(answer)
  const titleHref = answer.siteUrl || null
  const characterHref = showCharacterName
    ? revealCharacter?.siteUrl || null
    : null

  const bonusAnswerLabel = useMemo(() => {
    const names = acceptedBonusCharacters.map(characterDisplayName)
    const unique = [...new Set(names.filter(Boolean))]
    return unique.join(' · ') || (bonusCharacter ? characterDisplayName(bonusCharacter) : '')
  }, [acceptedBonusCharacters, bonusCharacter])

  const characterOptions = useMemo(
    () => collectCharacters(characterGuessPool.length > 0 ? characterGuessPool : [answer]),
    [characterGuessPool, answer],
  )

  useEffect(() => {
    if (!open) {
      setLocalBonus(null)
      setShareFeedback('idle')
      setPointsAwarded(null)
      setPlayXpAwarded(null)
      setLeveledUpTo(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || isArchive) return
    const latest = getLastPointsAwarded()
    if (latest) {
      setPointsAwarded(latest.delta)
      setPlayXpAwarded(latest.playPointDelta ?? latest.delta)
    }
    function onPoints(event: Event) {
      const detail = (event as CustomEvent<PointsAwardedDetail>).detail
      setPointsAwarded(detail?.delta ?? 0)
      setPlayXpAwarded(detail?.playPointDelta ?? detail?.delta ?? 0)
    }
    window.addEventListener(POINTS_AWARDED_EVENT, onPoints)
    return () => window.removeEventListener(POINTS_AWARDED_EVENT, onPoints)
  }, [open, isArchive])

  useEffect(() => {
    if (!open || isArchive || pointsAwarded == null || pointsAwarded <= 0) return
    if (account?.lifetimeEarned == null) return
    const after = playerLevelFromXp(account.lifetimeEarned).level
    const before = playerLevelFromXp(
      Math.max(0, account.lifetimeEarned - pointsAwarded),
    ).level
    if (after > before) setLeveledUpTo(after)
  }, [open, isArchive, pointsAwarded, account?.lifetimeEarned])

  useEffect(() => {
    if (!open || isArchive) return
    setCountdownMs(msUntilNextUtcMidnight())
    const id = window.setInterval(() => {
      setCountdownMs(msUntilNextUtcMidnight())
    }, 1000)
    return () => window.clearInterval(id)
  }, [open, isArchive])

  useEffect(() => {
    if (shareFeedback === 'idle') return
    const id = window.setTimeout(() => setShareFeedback('idle'), 1800)
    return () => window.clearTimeout(id)
  }, [shareFeedback])

  useEffect(() => {
    if (!open || !won) return
    if (doubleSolve) {
      void playSolveCelebrationSound('double-solve')
      return
    }
    if (firstTry) {
      void playSolveCelebrationSound('first-try')
    }
  }, [open, won, firstTry, doubleSolve])

  if (!open) return null

  async function handleShare() {
    async function copyToClipboard(): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(shareText)
        return true
      } catch {
        try {
          const ta = document.createElement('textarea')
          ta.value = shareText
          ta.setAttribute('readonly', '')
          ta.style.position = 'fixed'
          ta.style.left = '-9999px'
          document.body.appendChild(ta)
          ta.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(ta)
          return ok
        } catch {
          return false
        }
      }
    }

    // Wordle-style: always copy. Don't prefer navigator.share — on desktop it
    // opens the OS sheet and often never puts text on the clipboard.
    const copied = await copyToClipboard()
    if (copied) {
      setShareFeedback('copied')
      void reportSecretEvent('share_result')
      return
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
        setShareFeedback('shared')
        void reportSecretEvent('share_result')
        return
      } catch {
        /* user cancelled or share failed */
      }
    }

    setShareFeedback('copied')
  }

  const toastLabel =
    shareFeedback === 'shared' ? 'Shared' : 'Copied results to clipboard'

  function handleBonusCharacter(character: ManhwaCharacter, matchedLabel?: string) {
    if (!bonusCharacter || bonusResult || acceptedBonusCharacters.length === 0) return
    const correct = acceptedBonusCharacters.some((accepted) =>
      isBonusCharacterCorrect(character, accepted, matchedLabel),
    )
    const guessLabel = matchedLabel?.trim() || characterDisplayName(character)
    const result: BonusNameResult = {
      guess: guessLabel,
      correct,
      guessedCharacterId: character.id,
      guessLabel,
    }
    setLocalBonus(result)
    onBonusNameAnswer?.(result)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId="result-title"
      descriptionId="result-desc"
      shellClassName="result-shell"
      panelClassName={`${firstTry ? ' is-first-try' : ''}${showBonus ? ' has-bonus' : ''}${doubleSolve ? ' is-double-solve' : ''}${showCharacter ? ' is-character-reveal' : ''}`}
      backdropChildren={
        <>
          {won && <ConfettiBurst active firstTry={firstTry} />}
          {doubleSolve && <BonusCelebrate active />}
        </>
      }
    >
          {doubleSolve ? (
            <ElectricBorder variant="double-solve" />
          ) : (
            firstTry && <ElectricBorder />
          )}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
          <p id="result-desc" className="modal-kicker">
            {firstTry
              ? 'First try!'
              : won
                ? 'Solved'
                : surrendered
                  ? isArchive
                    ? 'Gave up'
                    : 'Gave up — try again tomorrow!'
                  : isArchive
                    ? 'Out of guesses'
                    : 'Out of guesses, try again tomorrow!'}
          </p>
          <h2 id="result-title" className="modal-title">
            {titleHref ? (
              <a
                className="modal-title-link"
                href={titleHref}
                target="_blank"
                rel="noreferrer"
                title={`Open ${titleText} on AniList`}
              >
                {titleText}
              </a>
            ) : (
              titleText
            )}
          </h2>
          {characterNameText && (
            characterHref ? (
              <a
                className="modal-character-subtitle"
                href={characterHref}
                target="_blank"
                rel="noreferrer"
                title={`Open ${characterNameText} on AniList`}
              >
                {characterNameText}
              </a>
            ) : (
              <p className="modal-character-subtitle">{characterNameText}</p>
            )
          )}
          {firstTry && (
            <p className="modal-score">
              <span className="modal-first-try-note">Nailed it on the opening guess</span>
            </p>
          )}
          {pointsAwarded !== null && (
            <p className={`result-points${pointsAwarded > 0 ? ' is-earned' : ''}`} role="status">
              {pointsAwarded > 0
                ? `+${pointsAwarded} shop points${
                    playXpAwarded != null && playXpAwarded > 0 && playXpAwarded !== pointsAwarded
                      ? ` (${playXpAwarded} play XP)`
                      : firstTry && playXpAwarded != null && playXpAwarded > 0
                        ? ' · first-try bonus'
                        : ''
                  }`
                : surrendered
                  ? 'No shop points for surrendering'
                  : won
                    ? 'No new shop points'
                    : 'XP only for correct answers'}
            </p>
          )}
          {leveledUpTo != null && (
            <p className="result-level-up" role="status">
              Level up! You reached level {leveledUpTo}
            </p>
          )}

          {heroImage && (
            <div className={`modal-hero${showCharacter ? ' is-character' : ''}`}>
              <MediaImage
                className={`modal-cover${showCharacter ? ' is-portrait' : ''}`}
                src={heroImage}
                alt={
                  showCharacter
                    ? characterNameText
                      ? `Portrait of ${characterNameText}`
                      : 'Character portrait for today’s puzzle'
                    : `Cover of ${titleText}`
                }
                fallbackLabel="Artwork unavailable"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          <div className="modal-meta">
            {showCharacter ? (
              <>
                <span>{answer.startDate.year ?? '—'}</span>
                <span>{answer.status}</span>
                <span>{answer.genres.slice(0, 2).join(' · ')}</span>
              </>
            ) : (
              <>
                <span>{answer.startDate.year ?? '—'}</span>
                <span>{answer.status}</span>
                <span>{answer.genres.slice(0, 3).join(' · ')}</span>
              </>
            )}
          </div>

          {showBonus && bonusCharacter && (
            <section
              className={[
                'bonus-question',
                bonusCorrect ? 'is-correct' : '',
                doubleSolve ? 'is-celebrating' : '',
                bonusResult && !bonusCorrect ? 'is-incorrect' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Bonus question"
            >
              <p className="bonus-kicker">Bonus question</p>
              <p className="bonus-prompt">{bonusPrompt}</p>

              {bonusPending ? (
                <CharacterGuessInput
                  characters={characterOptions}
                  onGuess={handleBonusCharacter}
                />
              ) : bonusCorrect ? (
                <div className="bonus-result is-correct">
                  <p className="bonus-result-title">
                    {doubleSolve ? '✦ DOUBLE SOLVE!' : 'Correct!'}
                  </p>
                  <p className="bonus-result-name">
                    {bonusResult?.guess || bonusAnswerLabel}
                  </p>
                </div>
              ) : (
                <div className="bonus-result is-incorrect">
                  <p className="bonus-result-title">Not quite</p>
                  <p className="bonus-result-guess">Your guess: {bonusResult?.guess}</p>
                  <p className="bonus-result-answer">
                    Correct answer: <strong>{bonusAnswerLabel}</strong>
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="modal-share-footer">
            <div className="modal-share-countdown">
              <span className="modal-share-countdown-label">
                {isArchive ? 'Archive' : 'Next puzzle'}
              </span>
              <span className="modal-share-countdown-value" aria-live="polite">
                {isArchive ? 'Stats don’t count' : formatCountdown(countdownMs)}
              </span>
            </div>
            <div className="modal-share-aside is-cluster">
              <div className="modal-share-result">
                <span
                  className={`modal-share-score is-${won ? 'win' : 'loss'}`}
                  aria-label="Score"
                >
                  {scoreLabel}
                </span>
                {shareLines.length > 0 && (
                  <button
                    type="button"
                    className="modal-share-mini-grid is-button"
                    style={{ ['--rows' as string]: shareLines.length }}
                    aria-label="Copy result"
                    title="Copy result"
                    onClick={handleShare}
                  >
                    {shareLines.map((line, i) => (
                      <span key={i} className="modal-share-mini-row">
                        {line}
                      </span>
                    ))}
                  </button>
                )}
                {doubleSolve && (
                  <span
                    className="modal-share-double"
                    title="Double solve"
                    aria-label="Double solve"
                  >
                    ✦
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn modal-share-btn"
                onClick={handleShare}
              >
                Share
              </button>
            </div>
          </div>

          {shareFeedback !== 'idle' && (
            <p className="modal-share-toast" role="status" aria-live="polite">
              {toastLabel}
            </p>
          )}
    </Dialog>
  )
}
