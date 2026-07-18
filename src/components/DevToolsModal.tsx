import { useEffect, useId, useState } from 'react'
import { Dialog } from './Dialog'
import {
  clearDevLeaderboard,
  loadDevLeaderboardState,
  seedSampleDevRankings,
  setDevLeaderboardEnabled,
  syncDevYouOnBoards,
  updateDevStanding,
  type DevStandingDraft,
} from '../lib/leaderboardDevFake'

/** Floating DEV-only tools for Top Rankings + streak/milestones previews. */
export function DevToolsLauncher() {
  const [open, setOpen] = useState(false)
  if (!import.meta.env.DEV) return null
  return (
    <>
      <button
        type="button"
        className="dev-tools-fab"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Dev
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

  function applyStanding() {
    updateDevStanding(standing)
    syncDevYouOnBoards()
    setNotice('Standing saved. Boards refreshed if override is on.')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="dev-tools-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal settings-modal dev-tools-modal"
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Local only</p>
      <h2 id={titleId} className="modal-title">
        Dev tools
      </h2>
      <p id="dev-tools-desc" className="auth-modal-intro">
        Override Top Rankings, your streak standing, and milestones in this browser. Nothing
        is written to Supabase.
      </p>

      <section className="settings-section" aria-labelledby="dev-override-heading">
        <h3 id="dev-override-heading" className="settings-section-title">
          Override
        </h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked
              setEnabled(next)
              setDevLeaderboardEnabled(next)
              setNotice(next ? 'Override on — homepage uses local data.' : 'Override off.')
            }}
          />
          <span>Use local rankings / streak data</span>
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
              setNotice('Seeded sample rankings (and turned override on).')
            }}
          >
            Seed sample rankings
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearDevLeaderboard()
              const state = loadDevLeaderboardState()
              setEnabled(false)
              setStanding(state.standing)
              setNotice('Cleared local ranking overrides.')
            }}
          >
            Clear overrides
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="dev-standing-heading">
        <h3 id="dev-standing-heading" className="settings-section-title">
          Account streak
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
            id="dev-any-current"
            label="Current streak"
            value={standing.anyCurrentStreak}
            onChange={(n) => setStanding((s) => ({ ...s, anyCurrentStreak: n }))}
          />
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
        <button type="button" className="btn btn-primary" onClick={applyStanding}>
          Save streak / sync boards
        </button>
      </section>

      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}

      <div className="modal-actions auth-modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
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
