import { useEffect, useId, useRef, useState } from 'react'

export type NewsCommentMenuItem = {
  id: string
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function NewsCommentMenu({
  items,
  disabled = false,
  label = 'Comment actions',
}: {
  items: NewsCommentMenuItem[]
  disabled?: boolean
  label?: string
}) {
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && wrapRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div className="news-comment-menu" ref={wrapRef}>
      <button
        type="button"
        className="news-comment-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={menuId} className="news-comment-menu-panel" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`news-comment-menu-item${item.danger ? ' is-danger' : ''}`}
              role="menuitem"
              disabled={disabled || item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
