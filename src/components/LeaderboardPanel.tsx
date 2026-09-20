import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from './Dialog'
import {
  entryKey,
  LeaderboardRow,
  LeaderboardShowcaseCard,
} from './LeaderboardCards'
import {
  LEADERBOARD_BOARDS,
  boardBlurb,
  boardLabel,
  type LeaderboardBoard,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { fetchLeaderboard } from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { LEADERBOARD_PATH } from '../lib/routes'
import { handleTabListKeyDown } from '../lib/focusTabs'

type LoadState = 'idle' | 'loading' | 'error' | 'ready'
type LeaderboardLayout = 'list' | 'showcase'

const SIDEBAR_LIMIT = 50
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
  return 'showcase'
}

function saveLeaderboardLayout(layout: LeaderboardLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  } catch {
    // ignore
  }
}

export function LeaderboardPanel() {
  const [active, setActive] = useState<LeaderboardBoard>('current_streak')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
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
    void fetchLeaderboard({ board: active, limit: SIDEBAR_LIMIT }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setState('error')
        setError('quiet')
        return
      }
      setEntries(result.page.entries)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, reloadToken])

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
          <Link to={LEADERBOARD_PATH} className="leaderboard-view-all">
            View all
          </Link>
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
