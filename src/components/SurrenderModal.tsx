import { createPortal } from 'react-dom'

interface SurrenderModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Confirm before ending the round and revealing the answer. */
export function SurrenderModal({ open, onCancel, onConfirm }: SurrenderModalProps) {
  if (!open) return null

  return createPortal(
    <div className="modal-backdrop surrender-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal surrender-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="surrender-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onCancel}
          aria-label="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="surrender-title" className="modal-title">
          Are you sure?
        </h2>
        <p className="surrender-intro">
          This ends the round and reveals the answer.
        </p>
        <div className="modal-actions surrender-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            No
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Yes, show me the answer…
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
