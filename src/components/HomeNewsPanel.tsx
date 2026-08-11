import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchPublicSiteUpdates,
  formatUpdateDate,
  splitUpdateBody,
  type SiteUpdate,
} from '../lib/siteUpdatesApi'
import { NEWS_PATH, newsPath } from '../lib/routes'

const HOME_NEWS_LIMIT = 3

export function HomeNewsPanel() {
  const [items, setItems] = useState<SiteUpdate[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchPublicSiteUpdates(HOME_NEWS_LIMIT).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(true)
        setItems([])
        return
      }
      setItems(result.updates)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="home-news" aria-labelledby="home-news-heading">
      <div className="home-news-head">
        <div>
          <h2 id="home-news-heading" className="home-section-title">
            News
          </h2>
          <p className="home-section-blurb">Announcements, releases, and what changed.</p>
        </div>
        <Link to={NEWS_PATH} className="home-section-all">
          All news
        </Link>
      </div>

      {items === null && (
        <p className="home-news-status panel-muted" role="status">
          Loading news…
        </p>
      )}
      {error && (
        <p className="home-news-status panel-muted" role="alert">
          News is unavailable right now.
        </p>
      )}
      {items && items.length === 0 && !error && (
        <p className="home-news-status panel-muted">No published news yet.</p>
      )}
      {items && items.length > 0 && (
        <ol className="home-news-list">
          {items.map((item) => {
            const dateLabel = formatUpdateDate(item.publishedAt ?? item.createdAt)
            const preview = splitUpdateBody(item.body)[0] ?? ''
            return (
              <li key={item.id} className="home-news-item">
                <article>
                  <div className="home-news-item-meta">
                    <span className={`home-news-kind is-${item.kind}`}>
                      {item.kind === 'announcement' ? 'Announcement' : 'Release update'}
                    </span>
                    {item.version && <span>v{item.version}</span>}
                    {dateLabel && (
                      <time dateTime={item.publishedAt ?? item.createdAt}>{dateLabel}</time>
                    )}
                  </div>
                  <h3 className="home-news-item-title">
                    <Link to={newsPath(item.slug)}>{item.title}</Link>
                  </h3>
                  {preview && <p className="home-news-preview">{preview}</p>}
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
