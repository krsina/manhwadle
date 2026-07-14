import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { GuessFeedback } from '../lib/anilist-types'
import { displayTitle } from '../lib/daily'

interface FeedbackGridProps {
  rows: GuessFeedback[]
}

const FLIP_DURATION_MS = 700
const FLIP_STAGGER_MS = 360
const CELL_COUNT = 5

function yearLabel(row: GuessFeedback): string {
  const { year, direction } = row.year
  if (year == null) return '?'
  if (direction === 'exact') return String(year)
  if (direction === 'up') return `${year} ↑`
  if (direction === 'down') return `${year} ↓`
  return String(year)
}

function genreLabel(row: GuessFeedback): string {
  if (row.genres.tone === 'correct') return 'All match'
  if (row.genres.tone === 'close') {
    return row.genres.shared.slice(0, 3).join(', ') || 'Partial'
  }
  return 'None'
}

function TagValue({ row }: { row: GuessFeedback }) {
  const tags = row.tags.guessed
  if (tags.length === 0) {
    return <span className="tile-value">None</span>
  }

  const sharedSet = new Set(row.tags.shared.map((t) => t.trim().toLowerCase()))
  const ordered = [
    ...tags.filter((tag) => sharedSet.has(tag.trim().toLowerCase())),
    ...tags.filter((tag) => !sharedSet.has(tag.trim().toLowerCase())),
  ]

  return (
    <div className="tile-scroll" tabIndex={0} role="region" aria-label="Guess tags">
      <ul className="tag-chips">
        {ordered.map((tag) => {
          const shared = sharedSet.has(tag.trim().toLowerCase())
          return (
            <li key={tag} className={`tag-chip${shared ? ' is-shared' : ' is-muted'}`}>
              {tag}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FlipCell({
  animate,
  delayMs,
  className,
  title,
  children,
}: {
  animate: boolean
  delayMs: number
  className: string
  title?: string
  children: ReactNode
}) {
  if (!animate) {
    return (
      <div className={className} title={title}>
        {children}
      </div>
    )
  }

  const style = { '--flip-delay': `${delayMs}ms` } as CSSProperties

  return (
    <div className="flip-cell" style={style}>
      <div className="flip-cell-inner">
        <div className="flip-cell-front" aria-hidden="true" />
        <div className={`flip-cell-back ${className}`} title={title}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FeedbackGrid({ rows }: FeedbackGridProps) {
  const prevLenRef = useRef(rows.length)
  const [flippingIndex, setFlippingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (rows.length > prevLenRef.current) {
      setFlippingIndex(rows.length - 1)
      const totalMs = FLIP_DURATION_MS + (CELL_COUNT - 1) * FLIP_STAGGER_MS + 80
      const timer = window.setTimeout(() => setFlippingIndex(null), totalMs)
      prevLenRef.current = rows.length
      return () => window.clearTimeout(timer)
    }
    prevLenRef.current = rows.length
  }, [rows.length])

  if (rows.length === 0) {
    return (
      <section className="feedback" aria-label="Guess feedback">
        <p className="feedback-empty">
          Guesses will appear here with genre, year, status, and tag clues.
        </p>
      </section>
    )
  }

  return (
    <section className="feedback" aria-label="Guess feedback">
      <div className="feedback-head" aria-hidden="true">
        <span>Title</span>
        <span>Genres</span>
        <span>Year</span>
        <span>Status</span>
        <span>Tags</span>
      </div>
      <ul className="feedback-list">
        {rows.map((row, index) => {
          const animate = index === flippingIndex
          return (
            <li
              key={`${row.manhwa.id}-${index}`}
              className={`feedback-row${row.isCorrect ? ' is-correct' : ''}${animate ? ' is-flipping' : ''}`}
            >
              <FlipCell animate={animate} delayMs={0} className="feedback-title">
                {row.manhwa.coverImage && (
                  <img
                    className="feedback-title-cover"
                    src={row.manhwa.coverImage}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                  />
                )}
                <span className="feedback-title-text">{displayTitle(row.manhwa)}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={FLIP_STAGGER_MS}
                className={`tile tone-${row.genres.tone}`}
                title={row.genres.guessed.join(', ')}
              >
                <span className="tile-label">Genres</span>
                <span className="tile-value">{genreLabel(row)}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={FLIP_STAGGER_MS * 2}
                className={`tile tone-${row.year.tone}`}
              >
                <span className="tile-label">Year</span>
                <span className="tile-value">{yearLabel(row)}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={FLIP_STAGGER_MS * 3}
                className={`tile tone-${row.status.tone}`}
              >
                <span className="tile-label">Status</span>
                <span className="tile-value">{row.status.status}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={FLIP_STAGGER_MS * 4}
                className="tile tile-tags"
              >
                <span className="tile-label">Tags</span>
                <TagValue row={row} />
              </FlipCell>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
