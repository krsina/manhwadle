import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { isTopDialog, pushDialog } from '../lib/dialogStack'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Element id for the visible title (aria-labelledby). */
  titleId: string
  /** Optional element id for description (aria-describedby). */
  descriptionId?: string
  className?: string
  backdropClassName?: string
  /** Extra class on the dialog panel (merged with `modal`). */
  panelClassName?: string
  closeOnBackdrop?: boolean
  /** When false, Escape does not dismiss the dialog. Default true. */
  closeOnEscape?: boolean
  /** Prefer this element for initial focus when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Content rendered inside the backdrop but outside the dialog panel (e.g. confetti). */
  backdropChildren?: ReactNode
  /** Optional wrapper around the panel (e.g. result-shell). */
  shellClassName?: string
  children: ReactNode
}

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
  )
}

/**
 * Shared portaled dialog: Escape, focus trap, return focus, aria-modal,
 * backdrop dismiss, body scroll lock, root inertness, nested-dialog safety.
 */
export function Dialog({
  open,
  onClose,
  titleId,
  descriptionId,
  className,
  backdropClassName = '',
  panelClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  backdropChildren,
  shellClassName,
  children,
}: DialogProps) {
  const reactId = useId()
  const dialogId = `dialog-${reactId.replace(/:/g, '')}`
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const panel = panelRef.current
    const unregister = pushDialog({
      id: dialogId,
      setInert: (inert) => {
        if (!panel) return
        // `inert` can reset scrollTop in Chromium; keep nested panels in place.
        const { scrollTop, scrollLeft } = panel
        if (inert) panel.setAttribute('inert', '')
        else panel.removeAttribute('inert')
        panel.scrollTop = scrollTop
        panel.scrollLeft = scrollLeft
        window.requestAnimationFrame(() => {
          panel.scrollTop = scrollTop
          panel.scrollLeft = scrollLeft
        })
      },
    })

    const focusTarget =
      initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
      listFocusable(panel ?? document.body)[0] ??
      panel

    // Defer so portal content is mounted.
    const frame = window.requestAnimationFrame(() => {
      focusTarget?.focus({ preventScroll: true })
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!isTopDialog(dialogId)) return
      event.preventDefault()
      event.stopPropagation()
      if (!closeOnEscape) return
      window.dispatchEvent(new Event('manhwadle:dialog-escape'))
      onClose()
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      unregister()
      const restore = previouslyFocused.current
      if (restore && document.contains(restore)) {
        restore.focus({ preventScroll: true })
      }
    }
  }, [open, onClose, dialogId, initialFocusRef, closeOnEscape])

  if (!open) return null

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!closeOnBackdrop) return
    if (event.target !== event.currentTarget) return
    if (!isTopDialog(dialogId)) return
    onClose()
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && isTopDialog(dialogId)) {
      event.preventDefault()
      event.stopPropagation()
      if (closeOnEscape) {
        window.dispatchEvent(new Event('manhwadle:dialog-escape'))
        onClose()
      }
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = listFocusable(panelRef.current)
    if (focusable.length === 0) {
      event.preventDefault()
      panelRef.current.focus()
      return
    }
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || active === panelRef.current) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const panel = (
    <div
      ref={panelRef}
      id={dialogId}
      className={`modal ${panelClassName} ${className ?? ''}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onPanelKeyDown}
    >
      {children}
    </div>
  )

  return createPortal(
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onClick={onBackdropClick}
    >
      {backdropChildren}
      {shellClassName ? (
        <div className={shellClassName} onClick={(e) => e.stopPropagation()}>
          {panel}
        </div>
      ) : (
        panel
      )}
    </div>,
    document.body,
  )
}
