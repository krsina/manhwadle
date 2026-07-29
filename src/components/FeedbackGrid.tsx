import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { GuessFeedback } from '../lib/anilist-types'
import { displayTitle } from '../lib/daily'
import { useMatchMedia } from '../hooks/useMatchMedia'

interface FeedbackGridProps {
  rows: GuessFeedback[]
}

/** Desktop 3D flip duration. */
const FLIP_DURATION_MS = 700
/** Mobile soft-fade duration. */
const MOBILE_REVEAL_DURATION_MS = 480
const FLIP_STAGGER_MS = 360
/** Snappier stagger on condensed mobile cards. */
const MOBILE_REVEAL_STAGGER_MS = 220
const CELL_COUNT = 6
const DESKTOP_RAIL_MQ = '(min-width: 960px)'
/** Compact mobile tags: shared first, then mute, then +N more. */
const COMPACT_TAG_LIMIT = 6

type TagDisplayMode = 'all' | 'compact'

function yearLabel(row: GuessFeedback): string {
  const { year, direction } = row.year
  if (year == null) return '?'
  if (direction === 'exact') return String(year)
  if (direction === 'up') return `${year} ↑`
  if (direction === 'down') return `${year} ↓`
  return String(year)
}

function toneMatchLabel(tone: string): string {
  if (tone === 'correct') return 'Exact'
  if (tone === 'close') return 'Close'
  return 'No match'
}

function GenreValue({ row }: { row: GuessFeedback }) {
  if (row.genres.tone === 'incorrect') {
    return <span className="tile-value">None</span>
  }

  const genres =
    row.genres.tone === 'correct' ? row.genres.guessed : row.genres.shared
  if (genres.length === 0) {
    return <span className="tile-value">{row.genres.tone === 'close' ? 'Partial' : 'None'}</span>
  }

  return <span className="tile-value">{genres.join(', ')}</span>
}

function TagValue({
  row,
  mode,
}: {
  row: GuessFeedback
  mode: TagDisplayMode
}) {
  const tags = row.tags.guessed
  if (tags.length === 0) {
    return <span className="tile-value">None</span>
  }

  const sharedSet = new Set(row.tags.shared.map((t) => t.trim().toLowerCase()))
  const ordered = [
    ...tags.filter((tag) => sharedSet.has(tag.trim().toLowerCase())),
    ...tags.filter((tag) => !sharedSet.has(tag.trim().toLowerCase())),
  ]

  const visible =
    mode === 'compact' && ordered.length > COMPACT_TAG_LIMIT
      ? ordered.slice(0, COMPACT_TAG_LIMIT)
      : ordered
  const hiddenCount = ordered.length - visible.length

  return (
    <div className="tile-scroll" tabIndex={0} role="region" aria-label="Guess tags">
      <ul className="tag-chips">
        {visible.map((tag) => {
          const shared = sharedSet.has(tag.trim().toLowerCase())
          return (
            <li key={tag} className={`tag-chip${shared ? ' is-shared' : ' is-muted'}`}>
              {tag}
            </li>
          )
        })}
        {hiddenCount > 0 ? (
          <li className="tag-chip tag-chip-more" title={ordered.slice(COMPACT_TAG_LIMIT).join(', ')}>
            +{hiddenCount} more
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function FlipCell({
  animate,
  delayMs,
  className,
  title,
  ariaLabel,
  children,
}: {
  animate: boolean
  delayMs: number
  className: string
  title?: string
  ariaLabel?: string
  children: ReactNode
}) {
  if (!animate) {
    return (
      <div className={className} title={title} aria-label={ariaLabel}>
        {children}
      </div>
    )
  }

  const style = { '--flip-delay': `${delayMs}ms` } as CSSProperties

  return (
    <div className="flip-cell" style={style}>
      <div className="flip-cell-inner">
        <div className="flip-cell-front" aria-hidden="true" />
        <div className={`flip-cell-back ${className}`} title={title} aria-label={ariaLabel}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FeedbackGrid({ rows }: FeedbackGridProps) {
  const isDesktop = useMatchMedia(DESKTOP_RAIL_MQ)
  const prevLenRef = useRef(rows.length)
  const [flippingIndex, setFlippingIndex] = useState<number | null>(null)
  const [tagMode, setTagMode] = useState<TagDisplayMode>('compact')
  const staggerMs = isDesktop ? FLIP_STAGGER_MS : MOBILE_REVEAL_STAGGER_MS
  const durationMs = isDesktop ? FLIP_DURATION_MS : MOBILE_REVEAL_DURATION_MS
  const effectiveTagMode: TagDisplayMode = isDesktop ? 'all' : tagMode

  useEffect(() => {
    if (rows.length > prevLenRef.current) {
      setFlippingIndex(rows.length - 1)
      const totalMs = durationMs + (CELL_COUNT - 1) * staggerMs + 80
      const timer = window.setTimeout(() => setFlippingIndex(null), totalMs)
      prevLenRef.current = rows.length
      return () => window.clearTimeout(timer)
    }
    prevLenRef.current = rows.length
  }, [rows.length, durationMs, staggerMs])

  if (rows.length === 0) {
    return (
      <section className="feedback" aria-label="Guess feedback">
        <p className="feedback-empty">
          Guesses will appear here with genre, year, status, publisher, and tag clues.
        </p>
      </section>
    )
  }

  return (
    <section
      className={`feedback${!isDesktop ? ` tags-${tagMode}` : ''}`}
      aria-label="Guess feedback"
    >
      <div className="feedback-toolbar">
        <p className="feedback-section-label">Guesses</p>
        {!isDesktop ? (
          <div className="feedback-tag-toggle" role="group" aria-label="Tag display">
            <button
              type="button"
              className={`feedback-tag-toggle-btn${tagMode === 'all' ? ' is-active' : ''}`}
              aria-pressed={tagMode === 'all'}
              onClick={() => setTagMode('all')}
            >
              All tags
            </button>
            <button
              type="button"
              className={`feedback-tag-toggle-btn${tagMode === 'compact' ? ' is-active' : ''}`}
              aria-pressed={tagMode === 'compact'}
              onClick={() => setTagMode('compact')}
            >
              Compact
            </button>
          </div>
        ) : null}
      </div>
      <div className="feedback-head">
        <span>Title</span>
        <span>Genres</span>
        <span>Year</span>
        <span>Status</span>
        <span>Publisher</span>
        <span>Tags</span>
      </div>
      <ul className="feedback-list">
        {rows.map((row, index) => {
          const animate = index === flippingIndex
          const tagsMatch = row.tags.shared.length > 0 ? 'Shared' : 'No match'
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
                <span className="feedback-title-text">
                  {row.displayLabel?.trim() || displayTitle(row.manhwa)}
                </span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={staggerMs}
                className={`tile tone-${row.genres.tone}`}
                title={row.genres.guessed.join(', ')}
                ariaLabel={`Genres, ${toneMatchLabel(row.genres.tone)}`}
              >
                <span className="tile-label">Genres</span>
                <span className="tile-tone-status">{toneMatchLabel(row.genres.tone)}</span>
                <GenreValue row={row} />
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={staggerMs * 2}
                className={`tile tone-${row.year.tone}`}
                ariaLabel={`Year, ${toneMatchLabel(row.year.tone)}`}
              >
                <span className="tile-label">Year</span>
                <span className="tile-tone-status">{toneMatchLabel(row.year.tone)}</span>
                <span className="tile-value">{yearLabel(row)}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={staggerMs * 3}
                className={`tile tone-${row.status.tone}`}
                ariaLabel={`Status, ${toneMatchLabel(row.status.tone)}`}
              >
                <span className="tile-label">Status</span>
                <span className="tile-tone-status">{toneMatchLabel(row.status.tone)}</span>
                <span className="tile-value">{row.status.status}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={staggerMs * 4}
                className={`tile tone-${row.publisher.tone}`}
                ariaLabel={`Publisher, ${toneMatchLabel(row.publisher.tone)}`}
              >
                <span className="tile-label">Publisher</span>
                <span className="tile-tone-status">{toneMatchLabel(row.publisher.tone)}</span>
                <span className="tile-value">{row.publisher.publisher}</span>
              </FlipCell>
              <FlipCell
                animate={animate}
                delayMs={staggerMs * 5}
                className="tile tile-tags"
                ariaLabel={`Tags, ${tagsMatch}`}
              >
                <span className="tile-label">Tags</span>
                <span className="tile-tone-status">{tagsMatch}</span>
                <TagValue row={row} mode={effectiveTagMode} />
              </FlipCell>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
