interface HardModeToggleProps {
  enabled: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  titleOn?: string
  titleOff?: string
  titleLocked?: string
}

/** Compact Wordle-style hard mode switch. */
export function HardModeToggle({
  enabled,
  disabled = false,
  onChange,
  titleOn = 'Hard mode on',
  titleOff = 'Turn on hard mode',
  titleLocked = 'Hard mode locks after your first guess',
}: HardModeToggleProps) {
  return (
    <button
      type="button"
      className={`hard-mode-toggle${enabled ? ' is-on' : ''}`}
      role="switch"
      aria-checked={enabled}
      aria-label="Hard mode"
      title={disabled ? titleLocked : enabled ? titleOn : titleOff}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onChange(!enabled)
      }}
    >
      <span className="hard-mode-toggle-label">Hard Mode</span>
      <span className="hard-mode-toggle-track" aria-hidden="true">
        <span className="hard-mode-toggle-thumb" />
      </span>
    </button>
  )
}
