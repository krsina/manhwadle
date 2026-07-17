import { useEffect, useMemo, useState } from 'react'
import type { Manhwa, ManhwaCharacter } from '../lib/anilist-types'
import { characterImageUrl } from '../lib/anilist-types'
import { characterDisplayName } from '../lib/characterNames'
import { displayTitle, formatCountdown, msUntilNextUtcMidnight } from '../lib/daily'
import type { ReaderTaste } from '../lib/readerTaste'
import {
  loadResultModalDemoFlags,
  subscribeResultModalDemoFlags,
} from '../lib/resultModalDemo'
import { collectCharacters } from '../lib/search'
import { nameOrderVariants, namesMatch } from '../lib/nameMatch'
import { getModeStats, winPercent, type StatsModeId } from '../lib/stats'
import { BonusCelebrate } from './BonusCelebrate'
import { CharacterGuessInput } from './CharacterGuessInput'
import { ConfettiBurst } from './ConfettiBurst'
import { ElectricBorder } from './ElectricBorder'
import { ResultModalDevPanel } from './ResultModalDevPanel'

interface BonusNameResult {
  guess: string
  correct: boolean
}

type ShareFeedback = 'idle' | 'copied' | 'shared'

interface ResultModalProps {
  open: boolean
  won: boolean
  answer: Manhwa
  guessCount: number
  maxGuesses: number
  shareText: string
  onClose: () => void
  /** Emoji rows for the share grid (DEV demo toggle) */
  shareLines?: string[]
  /** Mode + taste for streak strip (DEV demo toggle) */
  modeId?: StatsModeId
  taste?: ReaderTaste
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
  shareText,
  onClose,
  shareLines = [],
  modeId,
  taste,
  revealCharacter = null,
  characterImageUrlOverride = null,
  bonusCharacter = null,
  bonusAcceptCharacters,
  bonusPrompt = "What is the character's name?",
  characterGuessPool = [],
  bonusNameResult = null,
  onBonusNameAnswer,
  isArchive = false,
}: ResultModalProps) {
  const [localBonus, setLocalBonus] = useState<BonusNameResult | null>(null)
  const [countdownMs, setCountdownMs] = useState(() => msUntilNextUtcMidnight())
  const [demoFlags, setDemoFlags] = useState(loadResultModalDemoFlags)
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('idle')
  const isDev = import.meta.env.DEV

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

  const heroImage = showCharacter
    ? characterImageUrlOverride?.trim() ||
      characterImageUrl(revealCharacter!) ||
      null
    : answer.coverImage

  const titleText = showCharacterName
    ? characterDisplayName(revealCharacter!)
    : displayTitle(answer)

  const titleHref = showCharacterName
    ? revealCharacter?.siteUrl || null
    : answer.siteUrl || null

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
    }
  }, [open])

  useEffect(() => {
    if (!isDev) return
    return subscribeResultModalDemoFlags(() => setDemoFlags(loadResultModalDemoFlags()))
  }, [isDev])

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

  const showEmojiGrid = isDev && demoFlags.emojiGrid && shareLines.length > 0
  const showStreakStrip =
    isDev && demoFlags.streakStrip && !isArchive && Boolean(modeId) && Boolean(taste)
  const showSharePolish = isDev && demoFlags.sharePolish
  const showShareCluster = showSharePolish && demoFlags.shareCluster

  const streakStats = useMemo(() => {
    if (!showStreakStrip || !modeId || !taste) return null
    return getModeStats(modeId, taste, maxGuesses)
  }, [showStreakStrip, modeId, taste, maxGuesses])

  if (!open) return null

  async function handleShare() {
    const usePolish = showSharePolish
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText })
        if (usePolish) setShareFeedback('shared')
        return
      }
      await navigator.clipboard.writeText(shareText)
      if (usePolish) setShareFeedback('copied')
      else alert('Result copied to clipboard')
    } catch {
      try {
        await navigator.clipboard.writeText(shareText)
        if (usePolish) setShareFeedback('copied')
        else alert('Result copied to clipboard')
      } catch {
        if (usePolish) setShareFeedback('copied')
        else alert(shareText)
      }
    }
  }

  const toastLabel =
    shareFeedback === 'shared' ? 'Shared' : 'Copied results to clipboard'

  /** Wordle-style footer: countdown + compact share live together */
  const useWordleShareFooter = showSharePolish
  const showStandaloneCountdown = !useWordleShareFooter

  function handleBonusCharacter(character: ManhwaCharacter, matchedLabel?: string) {
    if (!bonusCharacter || bonusResult || acceptedBonusCharacters.length === 0) return
    const correct = acceptedBonusCharacters.some((accepted) =>
      isBonusCharacterCorrect(character, accepted, matchedLabel),
    )
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
        className={`result-shell${isDev ? ' has-dev-panel' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`modal${firstTry ? ' is-first-try' : ''}${showBonus ? ' has-bonus' : ''}${doubleSolve ? ' is-double-solve' : ''}${showCharacter ? ' is-character-reveal' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          {doubleSolve ? (
            <ElectricBorder variant="double-solve" />
          ) : (
            firstTry && <ElectricBorder />
          )}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
          <p className="modal-kicker">
            {firstTry
              ? 'First try!'
              : won
                ? 'Solved'
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
                title={
                  showCharacterName
                    ? `Open ${titleText} on AniList`
                    : `Open ${displayTitle(answer)} on AniList`
                }
              >
                {titleText}
              </a>
            ) : (
              titleText
            )}
          </h2>
          {(firstTry || !useWordleShareFooter) && (
            <p className="modal-score">
              {!useWordleShareFooter &&
                (won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`)}
              {firstTry && (
                <span className="modal-first-try-note">Nailed it on the opening guess</span>
              )}
            </p>
          )}

          {showEmojiGrid && (
            <pre className="modal-share-grid" aria-label="Guess grid">
              {shareLines.join('\n')}
            </pre>
          )}

          {showStreakStrip && streakStats && (
            <div className="modal-stats-strip" role="list" aria-label="Statistics">
              <div className="modal-stats-cell" role="listitem">
                <span className="modal-stats-value">{streakStats.played}</span>
                <span className="modal-stats-label">Played</span>
              </div>
              <div className="modal-stats-cell" role="listitem">
                <span className="modal-stats-value">{winPercent(streakStats)}</span>
                <span className="modal-stats-label">Win %</span>
              </div>
              <div className="modal-stats-cell" role="listitem">
                <span className="modal-stats-value">{streakStats.currentStreak}</span>
                <span className="modal-stats-label">Streak</span>
              </div>
              <div className="modal-stats-cell" role="listitem">
                <span className="modal-stats-value">{streakStats.maxStreak}</span>
                <span className="modal-stats-label">Max</span>
              </div>
            </div>
          )}

          {showStandaloneCountdown && (
            <p className="modal-countdown" aria-live="polite">
              {isArchive
                ? 'Historical puzzle · stats don’t count'
                : `Next puzzle in ${formatCountdown(countdownMs)}`}
            </p>
          )}

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
                <span>
                  from{' '}
                  {answer.siteUrl ? (
                    <a
                      className="modal-inline-link"
                      href={answer.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${displayTitle(answer)} on AniList`}
                    >
                      {displayTitle(answer)}
                    </a>
                  ) : (
                    displayTitle(answer)
                  )}
                </span>
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

          {useWordleShareFooter ? (
            <div className="modal-share-footer">
              <div className="modal-share-countdown">
                <span className="modal-share-countdown-label">
                  {isArchive ? 'Archive' : 'Next puzzle'}
                </span>
                <span className="modal-share-countdown-value" aria-live="polite">
                  {isArchive
                    ? 'Stats don’t count'
                    : formatCountdown(countdownMs)}
                </span>
              </div>
              <div
                className={`modal-share-aside${showShareCluster ? ' is-cluster' : ''}`}
              >
                {showShareCluster ? (
                  <div className="modal-share-result">
                    <span
                      className={`modal-share-score is-${won ? 'win' : 'loss'}`}
                      aria-label="Score"
                    >
                      {won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`}
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
                  </div>
                ) : (
                  <>
                    <span className="modal-share-score" aria-label="Score">
                      {won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`}
                    </span>
                    {shareLines.length > 0 && (
                      <div
                        className="modal-share-mini-grid"
                        style={{ ['--rows' as string]: shareLines.length }}
                        aria-label="Guess grid"
                      >
                        {shareLines.map((line, i) => (
                          <span key={i} className="modal-share-mini-row">
                            {line}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
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
                <button
                  type="button"
                  className="btn modal-share-btn"
                  onClick={handleShare}
                >
                  Share
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-cta"
                onClick={handleShare}
              >
                Share
              </button>
            </div>
          )}

          {showSharePolish && shareFeedback !== 'idle' && (
            <p className="modal-share-toast" role="status" aria-live="polite">
              {toastLabel}
            </p>
          )}
        </div>

        {isDev && <ResultModalDevPanel />}
      </div>
    </div>
  )
}
