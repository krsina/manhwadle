import { useId, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { useAuth } from './AuthProvider'
import {
  READER_TASTE_OPTIONS,
  readerTasteLabel,
  type ReaderTaste,
} from '../lib/readerTaste'

interface PreferencesModalProps {
  open: boolean
  onClose: () => void
  taste: ReaderTaste | null
  onTasteChange: (taste: ReaderTaste) => void
}

/** Taste-only preferences dialog opened from the header cog. */
export function PreferencesModal({
  open,
  onClose,
  taste,
  onTasteChange,
}: PreferencesModalProps) {
  const { user, updateSettings } = useAuth()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleTasteSelect(next: ReaderTaste) {
    onTasteChange(next)
    if (!user) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    const { error: nextError } = await updateSettings({ readerTaste: next })
    setBusy(false)
    if (nextError) {
      setError(nextError)
      return
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="prefs-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal preferences-modal"
      initialFocusRef={closeRef}
    >
      <button
        ref={closeRef}
        type="button"
        className="modal-close"
        onClick={onClose}
        aria-label="Close"
      >
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Preferences</p>
      <h2 id={titleId} className="modal-title">
        Reading preference
      </h2>
      <p id="prefs-desc" className="auth-modal-intro">
        {taste
          ? `Current: ${readerTasteLabel(taste)}. This switches today’s puzzle track.`
          : 'Choose a pool for today’s puzzles.'}
      </p>
      <div
        className="taste-options settings-taste-options"
        role="radiogroup"
        aria-label="Reading preference"
      >
        {READER_TASTE_OPTIONS.map((option) => {
          const selected = taste === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`taste-option${selected ? ' is-selected' : ''}`}
              disabled={busy}
              onClick={() => void handleTasteSelect(option.id)}
            >
              <span className="taste-option-label">{option.label}</span>
              <span className="taste-option-desc">{option.description}</span>
            </button>
          )
        })}
      </div>
      {error && (
        <p className="auth-modal-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
