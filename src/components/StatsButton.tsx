import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReaderTaste } from '../lib/readerTaste'
import { readerTasteLabel } from '../lib/readerTaste'
import {
  getCombinedStats,
  getModeStats,
  winPercent,
  type StatsModeId,
} from '../lib/stats'

type StatsViewId = StatsModeId | 'all'

const STATS_VIEWS: { id: StatsViewId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'character', label: 'Character' },
  { id: 'cover', label: 'Cover' },
  { id: 'heardle', label: 'Heardle' },
  { id: 'all', label: 'All' },
]

interface StatsButtonProps {
  /** Mode the player opened stats from — used as the default tab. */
  modeId: StatsModeId
  taste: ReaderTaste
  maxGuesses: number
}

/** Local streak / distribution panel with per-mode and combined views. */
export function StatsButton({ modeId, taste, maxGuesses }: StatsButtonProps) {
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
          initialView={modeId}
          taste={taste}
          maxGuesses={maxGuesses}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function StatsModal({
  initialView,
  taste,
  maxGuesses,
  onClose,
}: {
  initialView: StatsModeId
  taste: ReaderTaste
  maxGuesses: number
  onClose: () => void
}) {
  const [view, setView] = useState<StatsViewId>(initialView)

  const stats = useMemo(() => {
    if (view === 'all') return getCombinedStats(taste, maxGuesses)
    return getModeStats(view, taste, maxGuesses)
  }, [view, taste, maxGuesses])

  const maxBucket = Math.max(1, ...stats.guessDistribution)
  const bonusAttempts = stats.bonusAttempts ?? 0
  const bonusCorrect = stats.bonusCorrect ?? 0
  const doubleSolves = stats.doubleSolves ?? 0
  const firstTrySolves = stats.guessDistribution[0] ?? 0

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
        <h2 id="stats-title" className="modal-title">
          Statistics
        </h2>
        <p className="stats-taste">{readerTasteLabel(taste)}</p>

        <div
          className="stats-view-switcher"
          role="tablist"
          aria-label="Stats mode"
        >
          {STATS_VIEWS.map((option) => {
            const selected = view === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`stats-view-btn${selected ? ' is-active' : ''}`}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            )
          })}
        </div>

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

        <p className="stats-heading">Bonus</p>
        <div className="stats-grid stats-grid-bonus" role="list">
          <div className="stats-cell" role="listitem">
            <span className="stats-value">{firstTrySolves}</span>
            <span className="stats-label">First try solves</span>
          </div>
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
      </div>
    </div>,
    document.body,
  )
}
