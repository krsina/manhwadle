import { useState } from 'react'
import {
  READER_TASTE_OPTIONS,
  type ReaderTaste,
} from '../lib/readerTaste'

interface ReaderTastePromptProps {
  /** When set, chooser is a change-later dialog (dismissible). */
  currentTaste?: ReaderTaste | null
  onSelect: (taste: ReaderTaste) => void
  onClose?: () => void
}

/** First-visit or settings chooser for action / romance / both answer pools. */
export function ReaderTastePrompt({
  currentTaste = null,
  onSelect,
  onClose,
}: ReaderTastePromptProps) {
  const isEditing = currentTaste != null
  const [draft, setDraft] = useState<ReaderTaste | null>(currentTaste)

  return (
    <div
      className={`modal-backdrop taste-backdrop${isEditing ? ' is-editing' : ''}`}
      role="presentation"
      onClick={isEditing ? onClose : undefined}
    >
      <div
        className="modal taste-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="taste-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        {isEditing && onClose && (
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}
        <p className="modal-kicker">{isEditing ? 'Reading preference' : 'Welcome'}</p>
        <h2 id="taste-modal-title" className="modal-title">
          What do you usually read?
        </h2>
        <p className="taste-intro">
          We’ll pick today’s manhwa from a pool that matches your taste.
          {isEditing
            ? ' Changing this switches today’s puzzle track.'
            : ' You can change this later anytime.'}
        </p>
        <div className="taste-options" role="radiogroup" aria-label="Reading preference">
          {READER_TASTE_OPTIONS.map((option) => {
            const selected = draft === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`taste-option${selected ? ' is-selected' : ''}`}
                onClick={() => setDraft(option.id)}
              >
                <span className="taste-option-label">{option.label}</span>
                <span className="taste-option-desc">{option.description}</span>
              </button>
            )
          })}
        </div>
        <div className="taste-actions">
          {!isEditing && (
            <p className="taste-footnote">
              This preference can be changed later from the footer.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={draft == null}
            onClick={() => {
              if (draft == null) return
              onSelect(draft)
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
