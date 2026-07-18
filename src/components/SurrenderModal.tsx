import { useRef } from 'react'
import { Dialog } from './Dialog'

interface SurrenderModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Confirm before ending the round and revealing the answer. */
export function SurrenderModal({ open, onCancel, onConfirm }: SurrenderModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      titleId="surrender-title"
      descriptionId="surrender-desc"
      backdropClassName="surrender-backdrop"
      panelClassName="surrender-modal"
      initialFocusRef={confirmRef}
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
      <p id="surrender-desc" className="surrender-intro">
        This ends the round and reveals the answer.
      </p>
      <div className="modal-actions surrender-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          No
        </button>
        <button
          ref={confirmRef}
          type="button"
          className="btn btn-primary"
          onClick={onConfirm}
          data-dialog-initial-focus
        >
          Yes, show me the answer…
        </button>
      </div>
    </Dialog>
  )
}
