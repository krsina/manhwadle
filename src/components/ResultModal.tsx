import type { Manhwa } from '../lib/anilist-types'
import { displayTitle } from '../lib/daily'
import { ConfettiBurst } from './ConfettiBurst'
import { ElectricBorder } from './ElectricBorder'

interface ResultModalProps {
  open: boolean
  won: boolean
  answer: Manhwa
  guessCount: number
  maxGuesses: number
  shareText: string
  onClose: () => void
}

export function ResultModal({
  open,
  won,
  answer,
  guessCount,
  maxGuesses,
  shareText,
  onClose,
}: ResultModalProps) {
  if (!open) return null

  const firstTry = won && guessCount === 1

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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      {won && <ConfettiBurst active firstTry={firstTry} />}
      <div
        className={`modal${firstTry ? ' is-first-try' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        onClick={(e) => e.stopPropagation()}
      >
        {firstTry && <ElectricBorder />}
        <p className="modal-kicker">
          {firstTry
            ? 'First try!'
            : won
              ? 'Solved'
              : 'Out of guesses, try again tomorrow!'}
        </p>
        <h2 id="result-title" className="modal-title">
          {displayTitle(answer)}
        </h2>
        <p className="modal-score">
          {won ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`}
          {firstTry && (
            <span className="modal-first-try-note">Nailed it on the opening guess</span>
          )}
        </p>

        {answer.coverImage && (
          <img
            className="modal-cover"
            src={answer.coverImage}
            alt={`Cover of ${displayTitle(answer)}`}
            loading="lazy"
          />
        )}

        <div className="modal-meta">
          <span>{answer.startDate.year ?? '—'}</span>
          <span>{answer.status}</span>
          <span>{answer.genres.slice(0, 3).join(' · ')}</span>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={handleShare}>
            Share
          </button>
          <a
            className="btn btn-ghost"
            href={answer.siteUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open on AniList
          </a>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Keep playing
          </button>
        </div>
      </div>
    </div>
  )
}
