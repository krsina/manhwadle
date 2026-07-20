import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from './Dialog'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'
import {
  clearDevLeaderboard,
  isDevLeaderboardOverrideEnabled,
  loadDevLeaderboardState,
  seedBulkDevRankings,
  seedSampleDevRankings,
  setDevLeaderboardEnabled,
  syncDevYouOnBoards,
  updateDevStanding,
  type DevStandingDraft,
} from '../lib/leaderboardDevFake'
import { DEV_ANIMATIONS_PATH, DEV_ACTION_STRIP_PREVIEW_PATH } from '../lib/routes'
import { STREAK_PRESETS, streakTier } from '../lib/streakIntensity'
/** Floating owner+DEV tools for Top Rankings + streak badge previews. */
export function DevToolsLauncher() {
  const { ownerDev } = useOwnerDevAccess()
  const [open, setOpen] = useState(false)
  if (!ownerDev) return null
  return (
    <>
      <button
        type="button"
        className="dev-tools-fab"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Dev tools
      </button>
      <DevToolsModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function DevToolsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const [enabled, setEnabled] = useState(false)
  const [standing, setStanding] = useState<DevStandingDraft>(() => loadDevLeaderboardState().standing)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const state = loadDevLeaderboardState()
    setEnabled(state.enabled)
    setStanding(state.standing)
    setNotice(null)
  }, [open])

  if (!import.meta.env.DEV || !open) return null

  function ensureOverride() {
    if (!isDevLeaderboardOverrideEnabled()) {
      setDevLeaderboardEnabled(true)
      setEnabled(true)
    }
  }

  function applyStanding(nextStanding: DevStandingDraft = standing) {
    updateDevStanding(nextStanding)
    ensureOverride()
    syncDevYouOnBoards()
    const tier = streakTier(nextStanding.anyCurrentStreak)
    setNotice(
      `Header streak set to ${nextStanding.anyCurrentStreak} (${tier}). Check the badge beside Preferences.`,
    )
  }

  function applyPreset(days: number) {
    const next = {
      ...standing,
      anyCurrentStreak: days,
      anyMaxStreak: Math.max(standing.anyMaxStreak, days),
    }
    setStanding(next)
    applyStanding(next)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="dev-tools-desc"
      backdropClassName="dev-tools-backdrop"
      panelClassName="dev-tools-panel"
      closeOnBackdrop
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Local only</p>
      <h2 id={titleId} className="modal-title">
        Dev tools
      </h2>
      <p id="dev-tools-desc" className="auth-modal-intro">
        Test header streak intensity and Leaderboard without writing to Supabase. The page stays
        visible behind this panel.
      </p>

      <section className="settings-section settings-section-first" aria-labelledby="dev-anim-heading">
        <h3 id="dev-anim-heading" className="settings-section-title">
          Animation Creator
        </h3>
        <p className="settings-muted">
          Spec idle → action → return loops and export Cursor job packages for sequential frame
          generation.
        </p>
        <Link className="btn btn-primary" to={DEV_ANIMATIONS_PATH} onClick={onClose}>
          Open Animation Creator
        </Link>
        <Link
          className="btn btn-ghost"
          to={DEV_ACTION_STRIP_PREVIEW_PATH}
          onClick={onClose}
          style={{ marginLeft: '0.5rem' }}
        >
          Action strip preview
        </Link>
      </section>

      <section className="settings-section" aria-labelledby="dev-streak-heading">
        <h3 id="dev-streak-heading" className="settings-section-title">
          Player streak badge
        </h3>
        <p className="settings-muted">
          Current preview: <strong>{standing.anyCurrentStreak}</strong> (
          {streakTier(standing.anyCurrentStreak)})
        </p>
        <div className="dev-streak-presets" role="group" aria-label="Streak presets">
          {STREAK_PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              className={`btn btn-ghost dev-streak-preset${
                standing.anyCurrentStreak === days ? ' is-active' : ''
              }`}
              onClick={() => applyPreset(days)}
            >
              {days}
            </button>
          ))}
        </div>
        <label className="auth-field-label" htmlFor="dev-any-current">
          Custom current streak
        </label>
        <div className="dev-streak-custom">
          <input
            id="dev-any-current"
            type="number"
            min={0}
            className="auth-modal-input"
            value={standing.anyCurrentStreak}
            onChange={(e) =>
              setStanding((s) => ({ ...s, anyCurrentStreak: Number(e.target.value) }))
            }
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => applyStanding()}
          >
            Apply
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="dev-rankings-heading">
        <h3 id="dev-rankings-heading" className="settings-section-title">
          Rankings data
        </h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked
              setEnabled(next)
              setDevLeaderboardEnabled(next)
              setNotice(
                next
                  ? 'Override on. Leaderboard and streak badge use local test data.'
                  : 'Override off. Live / empty server data.',
              )
            }}
          />
          <span>Use local test rankings / streak</span>
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              seedSampleDevRankings()
              const state = loadDevLeaderboardState()
              setEnabled(true)
              setStanding(state.standing)
              setNotice('Populated test rankings.')
            }}
          >
            Populate test rankings
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              seedBulkDevRankings(500)
              const state = loadDevLeaderboardState()
              setEnabled(true)
              setStanding(state.standing)
              const n = state.boards.current_streak.length
              setNotice(`Populated ${n} local rankings (avatars + stages).`)
            }}
          >
            Populate 500 rankings
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearDevLeaderboard()
              const state = loadDevLeaderboardState()
              setEnabled(false)
              setStanding(state.standing)
              setNotice('Cleared test data.')
            }}
          >
            Clear test data
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="dev-standing-heading">
        <h3 id="dev-standing-heading" className="settings-section-title">
          Full standing
        </h3>
        <label className="auth-field-label" htmlFor="dev-username">
          Display name on boards
        </label>
        <input
          id="dev-username"
          className="auth-modal-input"
          value={standing.username}
          onChange={(e) => setStanding((s) => ({ ...s, username: e.target.value }))}
        />
        <div className="dev-tools-grid">
          <NumberField
            id="dev-any-max"
            label="Longest streak"
            value={standing.anyMaxStreak}
            onChange={(n) => setStanding((s) => ({ ...s, anyMaxStreak: n }))}
          />
          <NumberField
            id="dev-all-current"
            label="All-mode current"
            value={standing.allCurrentStreak}
            onChange={(n) => setStanding((s) => ({ ...s, allCurrentStreak: n }))}
          />
          <NumberField
            id="dev-all-max"
            label="All-mode longest"
            value={standing.allMaxStreak}
            onChange={(n) => setStanding((s) => ({ ...s, allMaxStreak: n }))}
          />
          <NumberField
            id="dev-completions"
            label="Total completions"
            value={standing.totalCompletions}
            onChange={(n) => setStanding((s) => ({ ...s, totalCompletions: n }))}
          />
          <NumberField
            id="dev-all-days"
            label="Full-clear days"
            value={standing.allCompleteDays}
            onChange={(n) => setStanding((s) => ({ ...s, allCompleteDays: n }))}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => applyStanding()}>
          Save standing / sync boards
        </button>
      </section>

      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
    </Dialog>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="dev-tools-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        min={0}
        className="auth-modal-input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
