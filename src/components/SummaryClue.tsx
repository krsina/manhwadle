interface SummaryClueProps {
  text: string
}

export function SummaryClue({ text }: SummaryClueProps) {
  return (
    <section className="clue" aria-label="Today's summary clue">
      <p className="clue-label">Today’s summary</p>
      <p className="clue-text">{text}</p>
    </section>
  )
}
