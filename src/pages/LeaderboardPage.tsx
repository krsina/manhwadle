import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  entryKey,
  LeaderboardRow,
  LeaderboardShowcaseCard,
} from '../components/LeaderboardCards'
import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_DEFAULT_LIMIT,
  boardLabel,
  type LeaderboardBoard,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { fetchLeaderboard, searchLeaderboard } from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { HOME_PATH } from '../lib/routes'
import { reportSecretEvent } from '../lib/secretEvents'
import { handleTabListKeyDown } from '../lib/focusTabs'
import { USERNAME_MAX, USERNAME_MIN } from '../lib/username'
import { isAccountSetupComplete } from '../lib/accountSetup'
import { useAuth } from '../components/AuthProvider'

type LoadState = 'idle' | 'loading' | 'error' | 'ready'
type PageLayout = 'hero' | 'list'
type SearchState = 'idle' | 'loading' | 'error' | 'ready'

const PAGE_LAYOUT_KEY = 'manhwadle:leaderboard-page-layout'

function boardTabLabel(board: LeaderboardBoard): string {
  switch (board) {
    case 'all_mode_streak':
      return 'All-mode'
    case 'longest_streak':
      return 'Longest'
    case 'current_streak':
      return 'Current'
  }
}

function loadPageLayout(): PageLayout {
  try {
    const raw = localStorage.getItem(PAGE_LAYOUT_KEY)
    if (raw === 'hero' || raw === 'list') return raw
  } catch {
    // ignore
  }
  return 'hero'
}

function savePageLayout(layout: PageLayout) {
  try {
    localStorage.setItem(PAGE_LAYOUT_KEY, layout)
  } catch {
    // ignore
  }
}

/** Full leaderboard with hero gallery (all avatars + stages) or compact list. */
export function LeaderboardPage() {
  const { user, account, accountLoading } = useAuth()
  const accountSetupComplete = isAccountSetupComplete(
    Boolean(user),
    accountLoading,
    account,
  )
  const [active, setActive] = useState<LeaderboardBoard>('current_streak')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [layout, setLayout] = useState<PageLayout>(() => loadPageLayout())
  const [searchDraft, setSearchDraft] = useState('')
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchHit, setSearchHit] = useState<LeaderboardEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onDevChange() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
  }, [])

  useEffect(() => {
    setSearchState('idle')
    setSearchError(null)
    setSearchHit(null)
    setSearchQuery(null)
  }, [active])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    setEntries([])
    setCursor(null)
    void fetchLeaderboard({ board: active, limit: LEADERBOARD_DEFAULT_LIMIT }).then(
      (result) => {
        if (cancelled) return
        if (!result.ok) {
          setState('error')
          setError(
            result.error === 'rate_limited'
              ? 'Too many requests — try again in a minute.'
              : 'Could not load the leaderboard.',
          )
          return
        }
        setEntries(result.page.entries)
        setCursor(result.page.nextCursor)
        setHasMore(result.page.hasMore)
        setState('ready')
        // Homepage rankings do not count; only the dedicated leaderboard page.
        if (accountSetupComplete) {
          void reportSecretEvent('leaderboard_view')
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [active, reloadToken, accountSetupComplete])

  async function loadMore() {
    if (!cursor || state === 'loading') return
    setState('loading')
    const result = await fetchLeaderboard({
      board: active,
      limit: LEADERBOARD_DEFAULT_LIMIT,
      cursor,
    })
    if (!result.ok) {
      setState('error')
      setError(
        result.error === 'rate_limited'
          ? 'Too many requests — try again in a minute.'
          : 'Could not load more rows.',
      )
      return
    }
    setEntries((prev) => [...prev, ...result.page.entries])
    setCursor(result.page.nextCursor)
    setHasMore(result.page.hasMore)
    setState('ready')
  }

  function toggleLayout() {
    setLayout((prev) => {
      const next: PageLayout = prev === 'hero' ? 'list' : 'hero'
      savePageLayout(next)
      return next
    })
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    const username = searchDraft.trim()
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      setSearchState('error')
      setSearchError(`Enter a username (${USERNAME_MIN}–${USERNAME_MAX} characters).`)
      setSearchHit(null)
      setSearchQuery(null)
      return
    }
    setSearchState('loading')
    setSearchError(null)
    setSearchHit(null)
    setSearchQuery(username)
    const result = await searchLeaderboard({ board: active, username })
    if (!result.ok) {
      setSearchState('error')
      setSearchError(
        result.error === 'rate_limited'
          ? 'Too many searches — try again in a minute.'
          : result.error === 'invalid_username'
            ? `Enter a username (${USERNAME_MIN}–${USERNAME_MAX} characters).`
            : 'Search failed. Try again.',
      )
      return
    }
    setSearchHit(result.entry)
    setSearchState('ready')
  }

  function clearSearch() {
    setSearchDraft('')
    setSearchState('idle')
    setSearchError(null)
    setSearchHit(null)
    setSearchQuery(null)
  }

  const hero = layout === 'hero'

  return (
    <main className="leaderboard-page">
      <div className="leaderboard-page-head">
        <div className="leaderboard-page-titles">
          <p className="leaderboard-page-kicker">Community</p>
          <h1 className="home-section-title">Leaderboard</h1>
          <p className="home-section-blurb">
            Streak rankings across Current, Longest, and All-mode boards. Hero view shows
            every player&apos;s avatar and stage.
          </p>
        </div>
        <div className="leaderboard-page-actions">
          <button
            type="button"
            className="leaderboard-layout-btn"
            aria-label={hero ? 'Switch to list view' : 'Switch to hero view'}
            title={hero ? 'List view' : 'Hero view'}
            aria-pressed={hero}
            onClick={toggleLayout}
          >
            <span aria-hidden="true">{hero ? '☰' : '▦'}</span>
          </button>
          <Link to={HOME_PATH} className="leaderboard-page-back">
            Back home
          </Link>
        </div>
      </div>

      <div
        className="leaderboard-tabs leaderboard-page-tabs"
        role="tablist"
        aria-label="Leaderboard"
        onKeyDown={(event) => handleTabListKeyDown(event, event.currentTarget)}
      >
        {LEADERBOARD_BOARDS.map((board) => {
          const selected = board === active
          return (
            <button
              key={board}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={boardLabel(board)}
              tabIndex={selected ? 0 : -1}
              className={`leaderboard-tab${selected ? ' is-active' : ''}`}
              onClick={() => setActive(board)}
            >
              {boardTabLabel(board)}
            </button>
          )
        })}
      </div>

      <form className="leaderboard-search" onSubmit={(e) => void handleSearch(e)}>
        <label className="leaderboard-search-label" htmlFor="leaderboard-search-username">
          Find player
        </label>
        <div className="leaderboard-search-row">
          <input
            id="leaderboard-search-username"
            className="leaderboard-search-input"
            type="search"
            name="username"
            autoComplete="username"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            placeholder="Exact username"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-describedby="leaderboard-search-hint"
          />
          <button
            type="submit"
            className="btn btn-primary leaderboard-search-submit"
            disabled={searchState === 'loading'}
          >
            {searchState === 'loading' ? 'Searching…' : 'Search'}
          </button>
          {(searchState === 'ready' || searchState === 'error' || searchQuery) && (
            <button
              type="button"
              className="btn btn-ghost leaderboard-search-clear"
              onClick={clearSearch}
            >
              Clear
            </button>
          )}
        </div>
        <p id="leaderboard-search-hint" className="leaderboard-search-hint">
          Exact match only — press Enter or Search. No partial usernames.
        </p>
        {searchError && (
          <p className="panel-error" role="alert">
            {searchError}
          </p>
        )}
        {searchState === 'ready' && searchQuery && !searchHit && (
          <p className="panel-muted" role="status">
            No exact match for “{searchQuery}” on {boardLabel(active)}.
          </p>
        )}
        {searchHit && (
          <div className="leaderboard-search-result" aria-live="polite">
            <p className="leaderboard-search-result-label">Match</p>
            {hero ? (
              <ol className="leaderboard-hero-grid leaderboard-search-hero">
                <LeaderboardShowcaseCard entry={searchHit} variant="hero" />
              </ol>
            ) : (
              <ol className="leaderboard-list leaderboard-page-list">
                <LeaderboardRow entry={searchHit} />
              </ol>
            )}
          </div>
        )}
      </form>

      {state === 'loading' && entries.length === 0 && (
        <p className="panel-muted" aria-busy="true">
          Loading…
        </p>
      )}
      {error && entries.length === 0 && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}
      {error && entries.length > 0 && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}
      {state === 'ready' && entries.length === 0 && (
        <p className="panel-muted">No entries yet.</p>
      )}

      {hero && entries.length > 0 && (
        <ol className="leaderboard-hero-grid" aria-label={`${boardLabel(active)} rankings`}>
          {entries.map((entry) => (
            <LeaderboardShowcaseCard
              key={entryKey(entry)}
              entry={entry}
              variant="hero"
            />
          ))}
        </ol>
      )}

      {!hero && entries.length > 0 && (
        <ol className="leaderboard-list leaderboard-page-list">
          {entries.map((entry) => (
            <LeaderboardRow key={entryKey(entry)} entry={entry} />
          ))}
        </ol>
      )}

      {hasMore && (
        <button
          type="button"
          className="btn btn-ghost leaderboard-more"
          disabled={state === 'loading'}
          onClick={() => void loadMore()}
        >
          {state === 'loading' ? 'Loading…' : 'Show more'}
        </button>
      )}
    </main>
  )
}
