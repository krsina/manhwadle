interface HowToPlayButtonProps {
  onClick: () => void
}

/** Compact “?” control for reopening a mode’s how-to guide. */
export function HowToPlayButton({ onClick }: HowToPlayButtonProps) {
  return (
    <button
      type="button"
      className="howto-btn"
      onClick={onClick}
      aria-label="How to play"
      title="How to play"
    >
      <span aria-hidden="true">?</span>
    </button>
  )
}
