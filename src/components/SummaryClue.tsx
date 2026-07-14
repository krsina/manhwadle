interface SummaryClueProps {
  /** Blurbs unlocked so far, in order */
  blurbs: string[]
  /** Total blurbs for today (for progress label) */
  totalBlurbs: number
  finished: boolean
}

export function SummaryClue({ blurbs, totalBlurbs, finished }: SummaryClueProps) {
  const unlocked = blurbs.length
  const label = finished
    ? 'Full summary'
    : unlocked >= totalBlurbs
      ? 'Full summary'
      : `Summary clue ${unlocked}/${totalBlurbs}`

  return (
    <section className="clue" aria-label="Today's summary clue">
      <div className="clue-header">
        <p className="clue-label">{label}</p>
        {!finished && unlocked < totalBlurbs && (
          <p className="clue-hint">Wrong guesses unlock the next blurb</p>
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
