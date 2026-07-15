import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReaderTaste } from '../lib/readerTaste'
import { readerTasteLabel } from '../lib/readerTaste'
import {
  getModeStats,
  winPercent,
  type StatsModeId,
} from '../lib/stats'

interface StatsModalProps {
  modeId: StatsModeId
  modeLabel: string
  taste: ReaderTaste
  maxGuesses: number
}

/** Local streak / distribution panel for the active mode + taste lane. */
export function StatsButton({
  modeId,
  modeLabel,
  taste,
  maxGuesses,
}: StatsModalProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="howto-btn"
        aria-label="Statistics"
        title="Statistics"
        onClick={() => setOpen(true)}
      >
        ▦
      </button>
      {open && (
        <StatsModal
          modeId={modeId}
          modeLabel={modeLabel}
          taste={taste}
          maxGuesses={maxGuesses}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function StatsModal({
  modeId,
  modeLabel,
  taste,
  maxGuesses,
  onClose,
}: StatsModalProps & { onClose: () => void }) {
  const stats = useMemo(
    () => getModeStats(modeId, taste, maxGuesses),
    [modeId, taste, maxGuesses],
  )

  const maxBucket = Math.max(1, ...stats.guessDistribution)
  const showBonus = modeId === 'character'
  const bonusAttempts = stats.bonusAttempts ?? 0
  const bonusCorrect = stats.bonusCorrect ?? 0
  const doubleSolves = stats.doubleSolves ?? 0

  return createPortal(
    <div
      className="modal-backdrop stats-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <p className="modal-kicker">Statistics</p>
        <h2 id="stats-title" className="modal-title">
          {modeLabel}
        </h2>
        <p className="stats-taste">{readerTasteLabel(taste)}</p>

        <div className="stats-grid" role="list">
          <div className="stats-cell" role="listitem">
            <span className="stats-value">{stats.played}</span>
            <span className="stats-label">Played</span>
          </div>
          <div className="stats-cell" role="listitem">
            <span className="stats-value">{winPercent(stats)}</span>
            <span className="stats-label">Win %</span>
          </div>
          <div className="stats-cell" role="listitem">
            <span className="stats-value">{stats.currentStreak}</span>
            <span className="stats-label">Streak</span>
          </div>
          <div className="stats-cell" role="listitem">
            <span className="stats-value">{stats.maxStreak}</span>
            <span className="stats-label">Max streak</span>
          </div>
        </div>

        <p className="stats-heading">Guess distribution</p>
        <ul className="stats-bars">
          {stats.guessDistribution.map((count, index) => (
            <li key={index} className="stats-bar-row">
              <span className="stats-bar-label">{index + 1}</span>
              <div className="stats-bar-track">
                <div
                  className={`stats-bar-fill${count > 0 ? ' has-value' : ''}`}
                  style={{
                    width: `${Math.max(count > 0 ? 12 : 0, (count / maxBucket) * 100)}%`,
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {showBonus && (
          <>
            <p className="stats-heading">Character bonus</p>
            <div className="stats-grid stats-grid-bonus" role="list">
              <div className="stats-cell" role="listitem">
                <span className="stats-value">
                  {bonusAttempts > 0
                    ? Math.round((bonusCorrect / bonusAttempts) * 100)
                    : 0}
                </span>
                <span className="stats-label">Bonus %</span>
              </div>
              <div className="stats-cell" role="listitem">
                <span className="stats-value">{doubleSolves}</span>
                <span className="stats-label">Double solves</span>
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
