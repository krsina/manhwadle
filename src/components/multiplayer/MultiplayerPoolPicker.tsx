import {
  MULTIPLAYER_POOL_SOURCES,
  type MultiplayerPoolSource,
} from '../../lib/multiplayerTypes'
import { MULTIPLAYER_POOL_META } from './multiplayerPoolMeta'

interface MultiplayerPoolPickerProps {
  value: MultiplayerPoolSource
  onChange: (value: MultiplayerPoolSource) => void
  disabled?: boolean
}

export function MultiplayerPoolPicker({
  value,
  onChange,
  disabled = false,
}: MultiplayerPoolPickerProps) {
  return (
    <fieldset className="multiplayer-pool-picker" disabled={disabled}>
      <legend className="versus-label">Title pool</legend>
      <div className="multiplayer-pool-options">
        {MULTIPLAYER_POOL_SOURCES.map((source) => (
          <label
            className={`multiplayer-pool-option${value === source ? ' is-selected' : ''}`}
            key={source}
          >
            <input
              type="radio"
              name="multiplayer-pool-source"
              value={source}
              checked={value === source}
              onChange={() => onChange(source)}
            />
            <span>
              <strong>{MULTIPLAYER_POOL_META[source].title}</strong>
              <small>{MULTIPLAYER_POOL_META[source].detail}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
