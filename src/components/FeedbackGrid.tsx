import type { GuessFeedback } from '../lib/anilist-types'
import { displayTitle } from '../lib/daily'

interface FeedbackGridProps {
  rows: GuessFeedback[]
}

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

export function FeedbackGrid({ rows }: FeedbackGridProps) {
  if (rows.length === 0) {
    return (
      <section className="feedback" aria-label="Guess feedback">
        <p className="feedback-empty">Guesses will appear here with genre, year, status, and tag clues.</p>
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
        {rows.map((row, index) => (
          <li
            key={`${row.manhwa.id}-${index}`}
            className={`feedback-row${row.isCorrect ? ' is-correct' : ''}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="feedback-title">
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
            </div>
            <div className={`tile tone-${row.genres.tone}`} title={row.genres.guessed.join(', ')}>
              <span className="tile-label">Genres</span>
              <span className="tile-value">{genreLabel(row)}</span>
            </div>
            <div className={`tile tone-${row.year.tone}`}>
              <span className="tile-label">Year</span>
              <span className="tile-value">{yearLabel(row)}</span>
            </div>
            <div className={`tile tone-${row.status.tone}`}>
              <span className="tile-label">Status</span>
              <span className="tile-value">{row.status.status}</span>
            </div>
            <div className="tile tile-tags">
              <span className="tile-label">Tags</span>
              <TagValue row={row} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
