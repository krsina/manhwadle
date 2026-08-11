import type { KeyboardEvent } from 'react'
import {
  MULTIPLAYER_MAX_PLAYERS,
  MULTIPLAYER_MIN_PLAYERS,
} from '../../lib/multiplayerTypes'

interface MultiplayerCapacityPickerProps {
  value: number
  /** Seats already taken; capacity can never drop below this. */
  floor?: number
  disabled?: boolean
  onChange: (value: number) => void
}

const SEAT_OPTIONS = Array.from(
  { length: MULTIPLAYER_MAX_PLAYERS - MULTIPLAYER_MIN_PLAYERS + 1 },
  (_, index) => index + MULTIPLAYER_MIN_PLAYERS,
)

export function MultiplayerCapacityPicker({
  value,
  floor = MULTIPLAYER_MIN_PLAYERS,
  disabled = false,
  onChange,
}: MultiplayerCapacityPickerProps) {
  function moveSelection(
    event: KeyboardEvent<HTMLButtonElement>,
    current: number,
  ) {
    const available = SEAT_OPTIONS.filter((count) => count >= floor)
    const currentIndex = available.indexOf(current)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % available.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + available.length) % available.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = available.length - 1
    } else {
      return
    }
    event.preventDefault()
    const next = available[nextIndex]
    onChange(next)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    )
    buttons?.[SEAT_OPTIONS.indexOf(next)]?.focus()
  }

  return (
    <fieldset className="versus-capacity" disabled={disabled}>
      <legend className="versus-label">Room capacity</legend>
      <div className="versus-capacity-row" role="radiogroup" aria-label="Room capacity">
        {SEAT_OPTIONS.map((count) => {
          const blocked = count < floor
          return (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={value === count}
              tabIndex={value === count ? 0 : -1}
              className={`versus-seat${value === count ? ' is-active' : ''}`}
              disabled={disabled || blocked}
              onClick={() => onChange(count)}
              onKeyDown={(event) => moveSelection(event, count)}
            >
              {count}
            </button>
          )
        })}
      </div>
      <p className="versus-hint">{value} seats · {MULTIPLAYER_MIN_PLAYERS} needed to start</p>
    </fieldset>
  )
}
