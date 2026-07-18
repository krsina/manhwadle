import { useEffect, useState } from 'react'
import {
  LEADERBOARD_BOARDS,
  boardBlurb,
  boardLabel,
  type LeaderboardBoard,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { fetchLeaderboard } from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { handleTabListKeyDown } from '../lib/focusTabs'

type LoadState = 'idle' | 'loading' | 'error' | 'ready'

const SIDEBAR_LIMIT = 10

export function LeaderboardPanel() {
  const [active, setActive] = useState<LeaderboardBoard>('current_streak')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onDevChange() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    setEntries([])
    setCursor(null)
    void fetchLeaderboard({ board: active, limit: SIDEBAR_LIMIT }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setState('error')
        setError(
          result.error === 'unconfigured'
            ? 'Top Rankings are unavailable in this environment.'
            : 'Could not load Top Rankings.',
        )
        return
      }
      setEntries(result.page.entries)
      setCursor(result.page.nextCursor)
      setHasMore(result.page.hasMore)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, reloadToken])

  async function loadMore() {
    if (!cursor || state === 'loading') return
    setState('loading')
    const result = await fetchLeaderboard({ board: active, limit: SIDEBAR_LIMIT, cursor })
    if (!result.ok) {
      setState('error')
      setError('Could not load more rows.')
      return
    }
    setEntries((prev) => [...prev, ...result.page.entries])
    setCursor(result.page.nextCursor)
    setHasMore(result.page.hasMore)
    setState('ready')
  }

  return (
    <section className="leaderboard-panel" aria-labelledby="leaderboard-heading">
      <div className="leaderboard-panel-head">
        <h2 id="leaderboard-heading" className="home-section-title">
          Top Rankings
        </h2>
      </div>

      <div
        className="leaderboard-tabs"
        role="tablist"
        aria-label="Top Rankings"
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
              tabIndex={selected ? 0 : -1}
              className={`leaderboard-tab${selected ? ' is-active' : ''}`}
              onClick={() => setActive(board)}
            >
              {boardLabel(board)}
            </button>
          )
        })}
      </div>

      <p className="panel-muted">
        Community rankings are server-validated but not cheat-proof.
      </p>
      <p className="leaderboard-board-blurb">{boardBlurb(active)}</p>

      {state === 'loading' && entries.length === 0 && (
        <p className="panel-muted" aria-busy="true">
          Loading…
        </p>
      )}
      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}
      {state === 'ready' && entries.length === 0 && (
        <p className="panel-muted">No entries yet.</p>
      )}

      {entries.length > 0 && (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li key={`${entry.publicId}-${entry.rank}-${entry.value}`} className="leaderboard-row">
              <span className="leaderboard-rank" aria-label={`Rank ${entry.rank}`}>
                {entry.rank}
              </span>
              <span className="leaderboard-name">{entry.username}</span>
              <span className="leaderboard-value">{entry.value}</span>
            </li>
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
    </section>
  )
}
