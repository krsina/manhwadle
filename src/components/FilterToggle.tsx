interface FilterToggleProps {
  enabled: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label?: string
  titleOn?: string
  titleOff?: string
  titleLocked?: string
}

/** Compact companion toggle (e.g. hard-mode color unlock). */
export function FilterToggle({
  enabled,
  disabled = false,
  onChange,
  label = 'B&W',
  titleOn = 'Filter on',
  titleOff = 'Filter off',
  titleLocked = 'Locked',
}: FilterToggleProps) {
  return (
    <button
      type="button"
      className={`hard-mode-toggle filter-toggle${enabled ? ' is-on' : ''}`}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={disabled ? titleLocked : enabled ? titleOn : titleOff}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onChange(!enabled)
      }}
    >
      <span className="hard-mode-toggle-label">{label}</span>
      <span className="hard-mode-toggle-track" aria-hidden="true">
        <span className="hard-mode-toggle-thumb" />
      </span>
    </button>
  )
}
