import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameModeDefinition } from '../modes'
import { ModeGlyph } from './ModeGlyph'
import { playPath, VERSUS_PATH } from '../lib/routes'
import {
  statusLabel,
  type ModeCompletionStatus,
} from '../lib/modeCompletion'
import { useAuth } from './AuthProvider'
import { SignInModal } from './AuthButton'

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
    completed || status === 'in_progress' ? 'Continue' : 'Play'
  const action = !available ? 'Unavailable' : actionLabel
  const showPlayCue = available && !completed

  const className = [
    'mode-row',
    `mode-row-${mode.presentationKey}`,
    !available ? 'is-unavailable' : '',
    completed ? 'is-complete' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const statusText = !available
    ? 'Temporarily unavailable'
    : status === 'not_started'
      ? 'Play'
      : status === 'in_progress'
        ? 'Continue'
        : statusLabel(status)

  const body = (
    <>
      <div className="mode-row-icon" aria-hidden="true" data-mode={mode.presentationKey}>
        <ModeGlyph presentationKey={mode.presentationKey} />
      </div>
      <div className="mode-row-body">
        <div className="mode-row-heading">
          <h2 id={`mode-row-title-${mode.id}`} className="mode-row-title">
            {mode.name}
          </h2>
          <p
            className={['mode-row-status', showPlayCue ? 'mode-row-status-cue' : '']
              .filter(Boolean)
              .join(' ')}
            data-status={status}
          >
            {showPlayCue && <PlayGlyph className="mode-row-status-glyph" />}
            {statusText}
          </p>
        </div>
        <p className="mode-row-desc">{mode.tagline}</p>
        {!available && unavailableMessage && (
          <p className="mode-row-outage">{unavailableMessage}</p>
        )}
      </div>
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
    >
      {body}
    </Link>
  )
}

/** Versus entry point, styled as a mode row so the home list reads as one family. */
export function VersusModeRow() {
  const { user, configured, signInWithMagicLink, signInWithOAuth } = useAuth()
  const [signInOpen, setSignInOpen] = useState(false)
  const signedIn = Boolean(user)

  const body = (
    <>
      <div className="mode-row-icon" aria-hidden="true" data-mode="versus">
        <ModeGlyph presentationKey="versus" />
      </div>
      <div className="mode-row-body">
        <div className="mode-row-heading">
          <h2 id="mode-row-title-versus" className="mode-row-title">
            Versus
          </h2>
          <p className="mode-row-status mode-row-status-cue">
            <PlayGlyph className="mode-row-status-glyph" />
            {signedIn ? 'Live' : 'Sign in'}
          </p>
        </div>
        <p className="mode-row-desc">Compete against your friends!</p>
      </div>
    </>
  )

  if (signedIn) {
    return (
      <Link
        className="mode-row mode-row-versus"
        to={VERSUS_PATH}
        aria-label="Play Versus"
      >
        {body}
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        className="mode-row mode-row-versus"
        aria-label="Sign in to play Versus"
        disabled={!configured}
        onClick={() => setSignInOpen(true)}
      >
        {body}
      </button>
      {signInOpen && (
        <SignInModal
          onClose={() => setSignInOpen(false)}
          onSignIn={signInWithMagicLink}
          onOAuth={signInWithOAuth}
        />
      )}
    </>
  )
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6.2v11.6L18.2 12 8.5 6.2z" fill="currentColor" />
    </svg>
  )
}
