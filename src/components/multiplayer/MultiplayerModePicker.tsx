import { ModeGlyph } from '../ModeGlyph'
import { MULTIPLAYER_MODE_META } from './multiplayerModeMeta'
import {
  MULTIPLAYER_MODE_ORDER,
  MULTIPLAYER_ROUNDS_PER_MODE,
  type MultiplayerMode,
} from '../../lib/multiplayerTypes'

interface MultiplayerModePickerProps {
  selected: MultiplayerMode[]
  disabled?: boolean
  onChange: (modes: MultiplayerMode[]) => void
}

export function MultiplayerModePicker({
  selected,
  disabled = false,
  onChange,
}: MultiplayerModePickerProps) {
  function toggle(mode: MultiplayerMode) {
    if (disabled) return
    const next = selected.includes(mode)
      ? selected.filter((candidate) => candidate !== mode)
      : MULTIPLAYER_MODE_ORDER.filter(
          (candidate) => selected.includes(candidate) || candidate === mode,
        )
    if (next.length > 0) onChange([...next])
  }

  return (
    <fieldset className="multiplayer-mode-picker" disabled={disabled}>
      <legend className="versus-label">Modes</legend>
      <p className="versus-hint">
        Rounds play in this order, {MULTIPLAYER_ROUNDS_PER_MODE} per mode.
      </p>
      <div className="multiplayer-mode-grid">
        {MULTIPLAYER_MODE_ORDER.map((mode) => {
          const meta = MULTIPLAYER_MODE_META[mode]
          const active = selected.includes(mode)
          const onlyPick = active && selected.length === 1
          return (
            <label
              key={mode}
              className={`multiplayer-mode-card${active ? ' is-active' : ''}`}
              title={onlyPick ? 'Keep at least one mode selected.' : undefined}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(mode)}
              />
              <span className="multiplayer-mode-icon" aria-hidden="true">
                <ModeGlyph presentationKey={meta.presentationKey} />
              </span>
              <span className="multiplayer-mode-copy">
                <strong>{meta.label}</strong>
                <small>{meta.blurb}</small>
              </span>
              <span className="multiplayer-mode-check" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M5 12.5l4.4 4.3L19 7.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
