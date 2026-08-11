import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { CatalogTileBody } from '../components/CatalogTileBody'
import type { Manhwa } from '../lib/anilist-types'
import { matchesCatalogQuery, sortCatalogByRank } from '../lib/catalogBrowse'
import { loadClientCatalog } from '../lib/clientCatalog'
import { displayTitle } from '../lib/daily'
import {
  filterPoolByTaste,
  READER_TASTE_OPTIONS,
  type ReaderTaste,
} from '../lib/readerTaste'
import { HOME_PATH } from '../lib/routes'

const PAGE_SIZE = 24

interface DatabasePageProps {
  taste: ReaderTaste | null
}

/** Browse the client manhwa catalog by popularity rank and reading preference. */
export function DatabasePage({ taste }: DatabasePageProps) {
  const [catalog, setCatalog] = useState<Manhwa[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [lane, setLane] = useState<ReaderTaste>(() => taste ?? 'both')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadClientCatalog()
      .then((data) => {
        if (cancelled) return
        setCatalog(data)
        setLoadError(null)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError('Could not load the catalog.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (taste) setLane(taste)
  }, [taste])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredQuery, lane])

  const ranked = useMemo(() => {
    if (!catalog) return []
    const tasted = filterPoolByTaste(catalog, lane)
    const matched = deferredQuery.trim()
      ? tasted.filter((manhwa) => matchesCatalogQuery(manhwa, deferredQuery))
      : tasted
    return sortCatalogByRank(matched)
  }, [catalog, deferredQuery, lane])

  const visible = ranked.slice(0, visibleCount)
  const hasMore = visibleCount < ranked.length

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisibleCount((n) => Math.min(n + PAGE_SIZE, ranked.length))
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, ranked.length, visible.length])

  return (
    <div className="database-page">
      <div className="database-page-head">
        <div>
          <p className="database-page-kicker">Catalog</p>
          <h1 className="home-section-title">Manhwa Database</h1>
          <p className="home-section-blurb database-page-blurb">
            Search through the manhwa we use for daily puzzles, ordered by AniList popularity.
            Filtered by reading preference.
          </p>
        </div>
        <Link to={HOME_PATH} className="database-page-back">
          Back home
        </Link>
      </div>

      <div className="database-controls">
        <label className="database-search-label" htmlFor="database-search">
          Search titles
        </label>
        <input
          id="database-search"
          className="database-search-input"
          type="search"
          name="q"
          autoComplete="off"
          spellCheck={false}
          placeholder="Title or alias"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div
          className="database-taste-tabs"
          role="tablist"
          aria-label="Reading preference filter"
        >
          {READER_TASTE_OPTIONS.map((option) => {
            const selected = option.id === lane
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`database-taste-tab${selected ? ' is-active' : ''}`}
                onClick={() => setLane(option.id)}
              >
                {option.id === 'both' ? 'Both' : option.id === 'action' ? 'Action' : 'Romance'}
              </button>
            )
          })}
        </div>
      </div>

      <p className="database-page-count" aria-live="polite">
        {catalog
          ? `${ranked.length.toLocaleString()} title${ranked.length === 1 ? '' : 's'}`
          : loadError
            ? loadError
            : 'Loading catalog…'}
      </p>

      {catalog && ranked.length === 0 && (
        <p className="panel-muted" role="status">
          No titles match that search in this preference.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="database-grid">
          {visible.map((manhwa) => {
            const title = displayTitle(manhwa)
            const body = <CatalogTileBody manhwa={manhwa} />
            return (
              <li key={manhwa.id} className="database-tile">
                {manhwa.siteUrl ? (
                  <a
                    className="database-tile-link"
                    href={manhwa.siteUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={title}
                  >
                    {body}
                  </a>
                ) : (
                  <div className="database-tile-link">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && (
        <div
          ref={loadMoreRef}
          className="database-scroll-sentinel"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
