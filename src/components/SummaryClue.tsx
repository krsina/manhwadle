import { RevealMoreButton } from './RevealMoreButton'

interface SummaryClueProps {
  /** Blurbs unlocked so far, in order */
  blurbs: string[]
  /** Total blurbs for today (for progress label) */
  totalBlurbs: number
  finished: boolean
  /** t0 only — no progressive unlock */
  hardMode?: boolean
  canRevealMore?: boolean
  onRevealMore?: () => void
}

export function SummaryClue({
  blurbs,
  totalBlurbs,
  finished,
  hardMode = false,
  canRevealMore = false,
  onRevealMore,
}: SummaryClueProps) {
  const unlocked = blurbs.length
  const label = hardMode
    ? 'Hard summary'
    : finished || unlocked >= totalBlurbs
      ? 'Full summary'
      : `Summary clue ${unlocked}/${totalBlurbs}`

  return (
    <section className="clue" aria-label="Today's summary clue">
      <div className="clue-header">
        <p className="clue-label">{label}</p>
        {hardMode ? (
          <p className="clue-hint">Opening clue only. Nothing else unlocks</p>
        ) : (
          !finished && (
            <div className="clue-hint-row">
              <p className="clue-hint">Wrong guesses unlock the next blurb</p>
              {onRevealMore && (
                <RevealMoreButton
                  onClick={onRevealMore}
                  disabled={!canRevealMore}
                />
              )}
            </div>
          )
        )}
      </div>
      <div className="clue-blurbs">
        {blurbs.map((text, index) => (
          <p
            key={`${index}-${text.slice(0, 24)}`}
            className={`clue-text${index === blurbs.length - 1 ? ' is-newest' : ''}`}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            {text}
          </p>
        ))}
      </div>
    </section>
  )
}
