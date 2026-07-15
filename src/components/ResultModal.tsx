import { useEffect, useMemo, useState } from 'react'
import type { Manhwa, ManhwaCharacter } from '../lib/anilist-types'
import { characterImageUrl } from '../lib/anilist-types'
import { characterDisplayName } from '../lib/characterNames'
import { displayTitle, formatCountdown, msUntilNextUtcMidnight } from '../lib/daily'
import { collectCharacters } from '../lib/search'
import { namesMatch } from '../lib/nameMatch'
import { BonusCelebrate } from './BonusCelebrate'
import { CharacterGuessInput } from './CharacterGuessInput'
import { ConfettiBurst } from './ConfettiBurst'
import { ElectricBorder } from './ElectricBorder'

interface BonusNameResult {
  guess: string
  correct: boolean
}

interface ResultModalProps {
  open: boolean
  won: boolean
  answer: Manhwa
  guessCount: number
  maxGuesses: number
  shareText: string
  onClose: () => void
  /** Character-mode: depicted cast member to reveal (win or loss) */
  revealCharacter?: ManhwaCharacter | null
  /** Prefer crop still over AniList portrait when set */
  characterImageUrlOverride?: string | null
  /** Character-mode: ask for the depicted character's name after a win */
  bonusCharacter?: ManhwaCharacter | null
  /** Catalog used to build the character-name autocomplete */
  characterGuessPool?: Manhwa[]
  /** Persisted one-shot bonus result, if already answered */
  bonusNameResult?: BonusNameResult | null
  onBonusNameAnswer?: (result: BonusNameResult) => void
}

function characterNameList(character: ManhwaCharacter): string[] {
  return [
    character.name.full,
    character.name.native,
    ...(character.name.alternative || []),
  ].filter((name): name is string => Boolean(name?.trim()))
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
  shareText,
  onClose,
  revealCharacter = null,
  characterImageUrlOverride = null,
  bonusCharacter = null,
  characterGuessPool = [],
  bonusNameResult = null,
  onBonusNameAnswer,
}: ResultModalProps) {
  const [localBonus, setLocalBonus] = useState<BonusNameResult | null>(null)
  const [countdownMs, setCountdownMs] = useState(() => msUntilNextUtcMidnight())

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

  const heroImage = showCharacter
    ? characterImageUrlOverride?.trim() ||
      characterImageUrl(revealCharacter!) ||
      null
    : answer.coverImage

  const titleText = showCharacterName
    ? characterDisplayName(revealCharacter!)
    : displayTitle(answer)

  const characterOptions = useMemo(
    () => collectCharacters(characterGuessPool.length > 0 ? characterGuessPool : [answer]),
    [characterGuessPool, answer],
  )

  useEffect(() => {
    if (!open) {
      setLocalBonus(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setCountdownMs(msUntilNextUtcMidnight())
    const id = window.setInterval(() => {
      setCountdownMs(msUntilNextUtcMidnight())
    }, 1000)
    return () => window.clearInterval(id)
  }, [open])

  if (!open) return null

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText })
        return
      }
      await navigator.clipboard.writeText(shareText)
      alert('Result copied to clipboard')
    } catch {
      try {
        await navigator.clipboard.writeText(shareText)
        alert('Result copied to clipboard')
      } catch {
        alert(shareText)
      }
    }
  }

  function handleBonusCharacter(character: ManhwaCharacter, matchedLabel?: string) {
    if (!bonusCharacter || bonusResult) return
    const correct = isBonusCharacterCorrect(character, bonusCharacter, matchedLabel)
    const result = {
      guess: matchedLabel?.trim() || characterDisplayName(character),
      correct,
    }
    setLocalBonus(result)
    onBonusNameAnswer?.(result)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      {won && <ConfettiBurst active firstTry={firstTry} />}
      {doubleSolve && <BonusCelebrate active />}
      <div
        className={`modal${firstTry ? ' is-first-try' : ''}${showBonus ? ' has-bonus' : ''}${doubleSolve ? ' is-double-solve' : ''}${showCharacter ? ' is-character-reveal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        onClick={(e) => e.stopPropagation()}
      >
        {doubleSolve ? (
          <ElectricBorder variant="double-solve" />
        ) : (
          firstTry && <ElectricBorder />
        )}
        <p className="modal-kicker">
          {firstTry
            ? 'First try!'
            : won
              ? 'Solved'
              : 'Out of guesses, try again tomorrow!'}
        </p>
        <h2 id="result-title" className="modal-title">
          {titleText}
        </h2>
        <p className="modal-score">
          {won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`}
          {firstTry && (
            <span className="modal-first-try-note">Nailed it on the opening guess</span>
          )}
        </p>
        <p className="modal-countdown" aria-live="polite">
          Next puzzle in {formatCountdown(countdownMs)}
        </p>

        {heroImage && (
          <img
            className={`modal-cover${showCharacter ? ' is-portrait' : ''}`}
            src={heroImage}
            alt={
              showCharacter
                ? showCharacterName
                  ? `Portrait of ${titleText}`
                  : 'Character portrait'
                : `Cover of ${displayTitle(answer)}`
            }
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}

        <div className="modal-meta">
          {showCharacter ? (
            <>
              <span>from {displayTitle(answer)}</span>
              <span>{answer.startDate.year ?? '—'}</span>
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
            <p className="bonus-prompt">What is the character&apos;s name?</p>

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
                <p className="bonus-result-name">{characterDisplayName(bonusCharacter)}</p>
              </div>
            ) : (
              <div className="bonus-result is-incorrect">
                <p className="bonus-result-title">Not quite</p>
                <p className="bonus-result-guess">Your guess: {bonusResult?.guess}</p>
                <p className="bonus-result-answer">
                  Correct answer: <strong>{characterDisplayName(bonusCharacter)}</strong>
                </p>
              </div>
            )}
          </section>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={handleShare}>
            Share
          </button>
          {showCharacterName && revealCharacter?.siteUrl && (
            <a
              className="btn btn-ghost"
              href={revealCharacter.siteUrl}
              target="_blank"
              rel="noreferrer"
            >
              Character on AniList
            </a>
          )}
          <a
            className="btn btn-ghost"
            href={answer.siteUrl}
            target="_blank"
            rel="noreferrer"
          >
            {showCharacter ? 'Series on AniList' : 'Open on AniList'}
          </a>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Keep playing
          </button>
        </div>
      </div>
    </div>
  )
}
