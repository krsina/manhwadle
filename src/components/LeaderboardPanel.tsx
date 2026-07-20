import { useEffect, useId, useState, type CSSProperties } from 'react'
import { Dialog } from './Dialog'
import { PixelAvatar } from './PixelAvatar'
import {
  LEADERBOARD_BOARDS,
  boardBlurb,
  boardLabel,
  type LeaderboardBoard,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { fetchLeaderboard } from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { avatarStageCssUrl, DEFAULT_STAGE_ID } from '../lib/avatarStages'
import { reportSecretEvent } from '../lib/secretEvents'
import { handleTabListKeyDown } from '../lib/focusTabs'

type LoadState = 'idle' | 'loading' | 'error' | 'ready'
type LeaderboardLayout = 'list' | 'showcase'

const SIDEBAR_LIMIT = 10
const SHOWCASE_TOP = 3
const LAYOUT_STORAGE_KEY = 'manhwadle:leaderboard-layout'
/** Matches `.home-main` stacking in styles.css — rankings become narrow. */
const COMPACT_LEADERBOARD_MQ = '(max-width: 980px)'

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

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

function loadLeaderboardLayout(): LeaderboardLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw === 'showcase' || raw === 'list') return raw
  } catch {
    // ignore
  }
  return 'list'
}

function saveLeaderboardLayout(layout: LeaderboardLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  } catch {
    // ignore
  }
}

function entryKey(entry: LeaderboardEntry): string {
  return `${entry.publicId}-${entry.rank}-${entry.value}`
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="leaderboard-medal" aria-hidden="true">
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
      </span>
    )
  }
  return <>{rank}</>
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={`leaderboard-row${entry.rank <= 3 ? ` is-top is-top-${entry.rank}` : ''}`}
    >
      <span className="leaderboard-rank" aria-label={`Rank ${entry.rank}`}>
        <RankBadge rank={entry.rank} />
      </span>
      <span className="leaderboard-player">
        <PixelAvatar
          characterId={entry.equippedAvatarId}
          size="sm"
          decorative
          className="leaderboard-avatar"
        />
        <span className="leaderboard-name">{entry.username}</span>
      </span>
      <span className="leaderboard-value">
        <span className="leaderboard-value-num">{entry.value}</span>
        <span className="leaderboard-value-unit" aria-hidden="true">
          {entry.value === 1 ? 'day' : 'days'}
        </span>
      </span>
    </li>
  )
}

function LeaderboardShowcaseCard({ entry }: { entry: LeaderboardEntry }) {
  const podium = entry.rank >= 1 && entry.rank <= 3 ? ` is-podium-${entry.rank}` : ''
  const stageStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(
      entry.equippedStageId ?? DEFAULT_STAGE_ID,
    ),
  } as CSSProperties
  return (
    <li
      className={`leaderboard-showcase-card${entry.rank <= 3 ? ` is-top is-top-${entry.rank}` : ''}${podium}`}
    >
      <div className="leaderboard-showcase-stage avatar-stage-well" style={stageStyle}>
        <span className="leaderboard-showcase-rank" aria-label={`Rank ${entry.rank}`}>
          <RankBadge rank={entry.rank} />
        </span>
        <PixelAvatar
          characterId={entry.equippedAvatarId}
          size="md"
          decorative
          className="leaderboard-showcase-avatar"
        />
      </div>
      <div className="leaderboard-showcase-meta">
        <span className="leaderboard-showcase-name">{entry.username}</span>
        <span className="leaderboard-showcase-value">
          <span className="leaderboard-value-num">{entry.value}</span>
          <span className="leaderboard-value-unit" aria-hidden="true">
            d
          </span>
        </span>
      </div>
    </li>
  )
}

export function LeaderboardPanel() {
  const [active, setActive] = useState<LeaderboardBoard>('current_streak')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const [layout, setLayout] = useState<LeaderboardLayout>(() => loadLeaderboardLayout())
  const compactViewport = useMatchMedia(COMPACT_LEADERBOARD_MQ)
  // Saved preference stays intact; compact viewports always render as list.
  const effectiveLayout: LeaderboardLayout = compactViewport ? 'list' : layout

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
        setError('quiet')
        return
      }
      setEntries(result.page.entries)
      setCursor(result.page.nextCursor)
      setHasMore(result.page.hasMore)
      setState('ready')
      void reportSecretEvent('leaderboard_view')
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

  function toggleLayout() {
    setLayout((prev) => {
      const next: LeaderboardLayout = prev === 'list' ? 'showcase' : 'list'
      saveLeaderboardLayout(next)
      return next
    })
  }

  const showcase = effectiveLayout === 'showcase'
  const featured = showcase ? entries.slice(0, SHOWCASE_TOP) : []
  const listEntries = showcase ? entries.slice(SHOWCASE_TOP) : entries

  return (
    <section className="leaderboard-panel" aria-labelledby="leaderboard-heading">
      <div className="leaderboard-panel-head">
        <div className="leaderboard-title-row">
          <h2 id="leaderboard-heading" className="home-section-title">
            Leaderboard
          </h2>
          <button
            type="button"
            className="leaderboard-info-btn"
            aria-label="How the Leaderboard works"
            title="How the Leaderboard works"
            onClick={() => setInfoOpen(true)}
          >
            <span aria-hidden="true">🏆</span>
          </button>
          {!compactViewport && (
            <button
              type="button"
              className="leaderboard-layout-btn"
              aria-label={showcase ? 'Switch to list view' : 'Switch to showcase view'}
              title={showcase ? 'List view' : 'Showcase view'}
              aria-pressed={showcase}
              onClick={toggleLayout}
            >
              <span aria-hidden="true">{showcase ? '☰' : '▦'}</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="leaderboard-tabs"
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

      {state === 'loading' && entries.length === 0 && (
        <p className="panel-muted" aria-busy="true">
          Loading…
        </p>
      )}
      {error && entries.length === 0 && (
        <p className="leaderboard-quiet" role="status">
          It&apos;s quiet here <span aria-hidden="true">☹️</span>
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

      {featured.length > 0 && (
        <ol className="leaderboard-showcase" aria-label="Top three">
          {featured.map((entry) => (
            <LeaderboardShowcaseCard key={entryKey(entry)} entry={entry} />
          ))}
        </ol>
      )}

      {listEntries.length > 0 && (
        <ol className={`leaderboard-list${showcase ? ' is-remainder' : ''}`}>
          {listEntries.map((entry) => (
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

      <RankingsInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </section>
  )
}

function RankingsInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="rankings-info-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal rankings-info-modal"
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Leaderboard</p>
      <h2 id={titleId} className="modal-title">
        How boards work
      </h2>
      <p id="rankings-info-desc" className="auth-modal-intro">
        Signed-in play with a public username counts. Wins, losses, and surrenders all count
        the same.
      </p>
      <ul className="rankings-info-list">
        {LEADERBOARD_BOARDS.map((board) => (
          <li key={board} className="rankings-info-item">
            <p className="rankings-info-name">{boardLabel(board)}</p>
            <p className="rankings-info-blurb">{boardBlurb(board)}</p>
          </li>
        ))}
      </ul>
      <div className="modal-actions auth-modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Dialog>
  )
}
