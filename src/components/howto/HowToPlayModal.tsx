import { createPortal } from 'react-dom'
import type { HowToPlayGuide } from '../../lib/howto'

interface HowToPlayModalProps {
  open: boolean
  guide: HowToPlayGuide
  onClose: () => void
}

/** Shared how-to dialog. Content comes from the active mode’s guide. */
export function HowToPlayModal({ open, guide, onClose }: HowToPlayModalProps) {
  if (!open) return null

  return createPortal(
    <div className="modal-backdrop howto-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal howto-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="modal-kicker">Help</p>
        <h2 id="howto-title" className="modal-title">
          {guide.title}
        </h2>
        {guide.intro && <p className="howto-intro">{guide.intro}</p>}

        <ol className="howto-steps">
          {guide.steps.map((step) => (
            <li key={step.title} className="howto-step">
              <p className="howto-step-title">{step.title}</p>
              <p className="howto-step-body">{step.body}</p>
            </li>
          ))}
        </ol>

        {guide.footer && <p className="howto-footer">{guide.footer}</p>}
      </div>
    </div>,
    document.body,
  )
}
