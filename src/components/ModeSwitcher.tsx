import { useRef } from 'react'
import { listDailyModes } from '../modes'
import { handleTabListKeyDown } from '../lib/focusTabs'

const MODE_STORAGE_KEY = 'manhwadle:mode'

export function loadStoredModeId(): string | null {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveStoredModeId(modeId: string): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, modeId)
  } catch {
    // Ignore private mode / storage failures
  }
}

export function readModeIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('mode')
  if (fromQuery) return fromQuery
  const hash = window.location.hash.replace(/^#/, '')
  return hash || null
}

interface ModeSwitcherProps {
  activeId: string
  onChange: (modeId: string) => void
}

/** Compact mode tabs for switching daily variants. */
export function ModeSwitcher({ activeId, onChange }: ModeSwitcherProps) {
  const modes = listDailyModes()
  const tablistRef = useRef<HTMLDivElement>(null)
  if (modes.length < 2) return null
  // Footer-only modes (Heardle) have no tab; keep the tablist keyboard-reachable.
  const hasActiveTab = modes.some((mode) => mode.id === activeId)

  return (
    <div
      ref={tablistRef}
      className="mode-switcher"
      role="tablist"
      aria-label="Game mode"
      onKeyDown={(event) => {
        if (tablistRef.current) handleTabListKeyDown(event, tablistRef.current)
      }}
    >
      {modes.map((mode, index) => {
        const active = mode.id === activeId
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active || (!hasActiveTab && index === 0) ? 0 : -1}
            className={`mode-switcher-btn${active ? ' is-active' : ''}`}
            onClick={() => onChange(mode.id)}
          >
            {mode.name}
          </button>
        )
      })}
    </div>
  )
}
