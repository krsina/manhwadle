interface RevealMoreButtonProps {
  onClick: () => void
  label?: string
  /** At the end of the clue ladder — keeps layout, blocks further reveals. */
  disabled?: boolean
}

/** Free clue advance — does not spend a guess. */
export function RevealMoreButton({
  onClick,
  label = 'Reveal more',
  disabled = false,
}: RevealMoreButtonProps) {
  return (
    <button
      type="button"
      className="clue-reveal-more"
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? 'No more hints to reveal'
          : 'Unlock the next hint without using a guess'
      }
    >
      {label}
    </button>
  )
}
