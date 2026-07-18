import { Link } from 'react-router-dom'
import type { GameModeDefinition } from '../modes'
import { playPath } from '../lib/routes'
import {
  statusLabel,
  type ModeCompletionStatus,
} from '../lib/modeCompletion'
import { noteModeEntrySource } from '../lib/telemetry'

interface ModeRowProps {
  mode: GameModeDefinition
  status: ModeCompletionStatus
  available: boolean
  unavailableMessage?: string | null
}

export function ModeRow({
  mode,
  status,
  available,
  unavailableMessage,
}: ModeRowProps) {
  const completed = status === 'completed'
  const actionLabel =
    completed || status === 'in_progress' ? 'Continue' : 'Play Game'
  const action = !available ? 'Unavailable' : actionLabel

  const className = [
    'mode-row',
    `mode-row-${mode.presentationKey}`,
    !available ? 'is-unavailable' : '',
    completed ? 'is-complete' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <div className="mode-row-icon" aria-hidden="true" data-mode={mode.presentationKey}>
        <ModeIcon presentationKey={mode.presentationKey} />
      </div>
      <div className="mode-row-body">
        <div className="mode-row-heading">
          <h2 id={`mode-row-title-${mode.id}`} className="mode-row-title">
            {mode.name}
          </h2>
          <p className="mode-row-status" data-status={status}>
            {available ? statusLabel(status) : 'Temporarily unavailable'}
          </p>
        </div>
        <p className="mode-row-desc">{mode.tagline}</p>
        {!available && unavailableMessage && (
          <p className="mode-row-outage">{unavailableMessage}</p>
        )}
      </div>
      {available && (
        <span className="mode-row-action" aria-hidden="true">
          {actionLabel}
        </span>
      )}
    </>
  )

  if (!available) {
    return (
      <article
        className={className}
        aria-labelledby={`mode-row-title-${mode.id}`}
        aria-disabled="true"
      >
        {body}
      </article>
    )
  }

  return (
    <Link
      className={className}
      to={playPath(mode.id)}
      aria-label={`${action} ${mode.name}`}
      onClick={() => noteModeEntrySource('home')}
    >
      {body}
    </Link>
  )
}

function ModeIcon({ presentationKey }: { presentationKey: string }) {
  switch (presentationKey) {
    case 'character':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M5 19c1-3.2 3.2-5 7-5s6 1.8 7 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'cover':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'heardle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 18V7l10-2v11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17" cy="16" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 5h12v14H6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M9 9h6M9 13h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
  }
}
