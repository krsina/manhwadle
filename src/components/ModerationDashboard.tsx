import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { Dialog } from './Dialog'
import { ModerationUpdatesPanel } from './ModerationUpdatesPanel'
import { handleTabListKeyDown } from '../lib/focusTabs'
import {
  TEMP_DURATION_OPTIONS,
  canUseModerationUi,
  endsAtFromHours,
  moderationForceRename,
  moderationBlockIdentity,
  moderationGetSiteStatus,
  moderationGrantRole,
  moderationIssueCloudBan,
  moderationIssueLeaderboardExclusion,
  moderationListAppeals,
  moderationListAudit,
  moderationListReports,
  moderationLookupUsername,
  moderationRevokeRestriction,
  moderationRevokeRole,
  moderationSetAppealStatus,
  moderationSetModeStatus,
  moderationSetOutageExemption,
  moderationSetReportStatus,
  moderationSetSiteStatus,
  type UserLookupResult,
} from '../lib/moderationApi'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'

type Tab = 'search' | 'reports' | 'appeals' | 'audit' | 'status' | 'updates'

interface ModerationDashboardProps {
  open?: boolean
  onClose?: () => void
  inline?: boolean
}

/** Staff console. Visibility is gated by server-reported role; actions recheck DB. */
export function ModerationDashboard({
  open = false,
  onClose = () => undefined,
  inline = false,
}: ModerationDashboardProps) {
  const { account } = useAuth()
  const { showUserModeToggle, userMode } = useOwnerDevAccess()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [usernameQuery, setUsernameQuery] = useState('')
  const [lookup, setLookup] = useState<UserLookupResult | null>(null)
  const [reason, setReason] = useState('')
  const [durationHours, setDurationHours] = useState<number>(24 * 7)
  const [permanent, setPermanent] = useState(false)
  const [identityKind, setIdentityKind] = useState<'email' | 'provider_subject'>('email')
  const [identityValue, setIdentityValue] = useState('')

  const [reports, setReports] = useState<unknown[]>([])
  const [appeals, setAppeals] = useState<unknown[]>([])
  const [audit, setAudit] = useState<unknown[]>([])
  const [siteStatus, setSiteStatus] = useState<Record<string, unknown> | null>(null)
  const [bannerDraft, setBannerDraft] = useState('')
  const [bannerSeverity, setBannerSeverity] = useState<'info' | 'warning' | 'critical'>(
    'info',
  )
  const [maintenance, setMaintenance] = useState(false)
  const [exemptionDate, setExemptionDate] = useState('')
  const [exemptionMode, setExemptionMode] = useState('summary')
  const [exemptionReason, setExemptionReason] = useState('')

  const isOwner = account?.staffRole === 'owner'
  const allowed =
    canUseModerationUi(account?.staffRole) && !(showUserModeToggle && userMode)

  useEffect(() => {
    if (!open || inline) return
    const prev = document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose, inline])

  useEffect(() => {
    if (!open) return
    setError(null)
    setNotice(null)
    setLookup(null)
    setUsernameQuery('')
    setReason('')
    setPermanent(false)
    setTab('search')
  }, [open])

  if ((!open && !inline) || !allowed) return null

  async function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await fn()
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Action failed')
      return
    }
    setNotice('Action completed.')
  }

  async function handleLookup(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await moderationLookupUsername(usernameQuery)
    setBusy(false)
    if (!result.ok) {
      setLookup(null)
      setError(result.error)
      return
    }
    setLookup(result.user)
  }

  async function loadQueue(next: Tab) {
    setTab(next)
    setError(null)
    setBusy(true)
    if (next === 'reports') {
      const result = await moderationListReports('open')
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const payload = result.data as { reports?: unknown }
      setReports(Array.isArray(payload.reports) ? payload.reports : [])
      return
    }
    if (next === 'appeals') {
      const result = await moderationListAppeals('open')
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const payload = result.data as { appeals?: unknown }
      setAppeals(Array.isArray(payload.appeals) ? payload.appeals : [])
      return
    }
    if (next === 'audit') {
      const result = await moderationListAudit(lookup?.user_id)
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const payload = result.data as { actions?: unknown }
      setAudit(Array.isArray(payload.actions) ? payload.actions : [])
      return
    }
    if (next === 'status') {
      const result = await moderationGetSiteStatus()
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const payload = result.data as { result?: Record<string, unknown> }
      const status = payload.result ?? null
      setSiteStatus(status)
      if (status) {
        setBannerDraft(
          typeof status.banner_message === 'string' ? status.banner_message : '',
        )
        setBannerSeverity(
          status.banner_severity === 'warning' || status.banner_severity === 'critical'
            ? status.banner_severity
            : 'info',
        )
        setMaintenance(status.maintenance_active === true)
      }
      return
    }
    if (next === 'updates') {
      setBusy(false)
      return
    }
    setBusy(false)
  }

  const targetId = lookup?.ok ? lookup.user_id : null

  const content = (
    <>
      {!inline && (
        <button
          ref={closeRef}
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
        <p className="modal-kicker">Staff</p>
        <h2 id={titleId} className="modal-title">
          Moderation
        </h2>
        <p id="moderation-desc" className="auth-modal-intro">
          Signed in as {account?.staffRole}. UI checks are convenience only; the server
          revalidates every action.
        </p>

        <div
          className="moderation-tabs"
          role="tablist"
          aria-label="Moderation sections"
          onKeyDown={(event) => handleTabListKeyDown(event, event.currentTarget)}
        >
          {(
            [
              { id: 'search' as const, label: 'Search' },
              { id: 'reports' as const, label: 'Reports' },
              { id: 'appeals' as const, label: 'Appeals' },
              { id: 'audit' as const, label: 'Audit' },
              ...(isOwner
                ? [
                    { id: 'status' as const, label: 'Status' },
                    { id: 'updates' as const, label: 'News' },
                  ]
                : []),
            ]
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className={`btn btn-ghost moderation-tab${tab === id ? ' is-active' : ''}`}
              disabled={busy}
              onClick={() => void loadQueue(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="auth-modal-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="settings-notice">{notice}</p>}

        {tab === 'search' && (
          <div className="moderation-panel">
            <form className="auth-modal-form" onSubmit={(e) => void handleLookup(e)}>
              <label className="auth-field-label" htmlFor="mod-username">
                Exact username
              </label>
              <input
                id="mod-username"
                className="auth-modal-input"
                value={usernameQuery}
                onChange={(e) => setUsernameQuery(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                placeholder="case-insensitive exact match"
              />
              <button type="submit" className="btn btn-primary" disabled={busy || !usernameQuery.trim()}>
                {busy ? 'Searching…' : 'Search'}
              </button>
            </form>

            {lookup?.ok && targetId && (
              <div className="moderation-target">
                <p>
                  <strong>{lookup.username}</strong>
                  {lookup.staff_role ? ` · ${lookup.staff_role}` : ''}
                  {lookup.cloud_banned ? ' · cloud banned' : ''}
                  {lookup.leaderboard_excluded ? ' · leaderboard excluded' : ''}
                  {lookup.force_username_change ? ' · rename required' : ''}
                </p>

                <label className="auth-field-label" htmlFor="mod-reason">
                  Reason (required)
                </label>
                <textarea
                  id="mod-reason"
                  className="auth-modal-input moderation-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                  maxLength={500}
                />

                <label className="auth-field-label" htmlFor="mod-duration">
                  Temporary duration
                </label>
                <select
                  id="mod-duration"
                  className="auth-modal-input"
                  value={durationHours}
                  disabled={busy || permanent}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                >
                  {TEMP_DURATION_OPTIONS.map((opt) => (
                    <option key={opt.hours} value={opt.hours}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {isOwner && (
                  <label className="moderation-check">
                    <input
                      type="checkbox"
                      checked={permanent}
                      disabled={busy}
                      onChange={(e) => setPermanent(e.target.checked)}
                    />
                    Permanent (owner only)
                  </label>
                )}

                <div className="moderation-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      void runAction(async () => {
                        const r = await moderationForceRename(targetId, reason)
                        return r.ok ? { ok: true } : { ok: false, error: r.error }
                      })
                    }
                  >
                    Force rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || reason.trim().length < 3 || (!permanent && !durationHours)}
                    onClick={() =>
                      void runAction(async () => {
                        const r = await moderationIssueCloudBan({
                          targetUserId: targetId,
                          reason,
                          permanent: isOwner && permanent,
                          endsAt:
                            isOwner && permanent
                              ? undefined
                              : endsAtFromHours(durationHours),
                        })
                        return r.ok ? { ok: true } : { ok: false, error: r.error }
                      })
                    }
                  >
                    Cloud ban
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      void runAction(async () => {
                        const r = await moderationIssueLeaderboardExclusion({
                          targetUserId: targetId,
                          reason,
                          permanent: isOwner && permanent,
                          endsAt:
                            isOwner && permanent
                              ? undefined
                              : endsAtFromHours(durationHours),
                        })
                        return r.ok ? { ok: true } : { ok: false, error: r.error }
                      })
                    }
                  >
                    Leaderboard exclude
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      void runAction(async () => {
                        const r = await moderationRevokeRestriction(
                          targetId,
                          'cloud_ban',
                          reason,
                        )
                        return r.ok ? { ok: true } : { ok: false, error: r.error }
                      })
                    }
                  >
                    Revoke cloud ban
                  </button>
                </div>

                {isOwner && (
                  <div className="moderation-actions moderation-owner-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() =>
                        void runAction(async () => {
                          const r = await moderationGrantRole(
                            targetId,
                            'moderator',
                            reason,
                          )
                          return r.ok ? { ok: true } : { ok: false, error: r.error }
                        })
                      }
                    >
                      Grant moderator
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() =>
                        void runAction(async () => {
                          const r = await moderationRevokeRole(
                            targetId,
                            'moderator',
                            reason,
                          )
                          return r.ok ? { ok: true } : { ok: false, error: r.error }
                        })
                      }
                    >
                      Revoke moderator
                    </button>
                    <select
                      className="auth-modal-input"
                      value={identityKind}
                      disabled={busy}
                      aria-label="Identity kind"
                      onChange={(event) =>
                        setIdentityKind(event.target.value as 'email' | 'provider_subject')
                      }
                    >
                      <option value="email">Email identity</option>
                      <option value="provider_subject">Provider subject</option>
                    </select>
                    <input
                      className="auth-modal-input"
                      value={identityValue}
                      disabled={busy}
                      aria-label="Identity value to block"
                      placeholder="Identity value"
                      onChange={(event) => setIdentityValue(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={
                        busy ||
                        reason.trim().length < 3 ||
                        identityValue.trim().length < 3
                      }
                      onClick={() =>
                        void runAction(async () => {
                          const result = await moderationBlockIdentity({
                            kind: identityKind,
                            value: identityValue.trim(),
                            reason,
                          })
                          return result.ok
                            ? { ok: true }
                            : { ok: false, error: result.error }
                        })
                      }
                    >
                      Block identity
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <ul className="moderation-queue">
            {reports.length === 0 && <li>No open reports.</li>}
            {reports.map((row, index) => {
              const item = row as Record<string, unknown>
              return (
                <li key={String(item.id ?? index)}>
                  <span>{String(item.reason_code ?? '')}</span>
                  <span className="moderation-queue-meta">
                    {String(item.target_username_normalized ?? '—')} ·{' '}
                    {String(item.status ?? '')}
                  </span>
                  <div className="moderation-actions">
                    {(['reviewing', 'resolved', 'dismissed'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            const result = await moderationSetReportStatus(
                              String(item.id),
                              status,
                              `Marked ${status} in staff console`,
                            )
                            if (result.ok) void loadQueue('reports')
                            return result
                          })
                        }
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {tab === 'appeals' && (
          <ul className="moderation-queue">
            {appeals.length === 0 && <li>No open appeals.</li>}
            {appeals.map((row, index) => {
              const item = row as Record<string, unknown>
              return (
                <li key={String(item.id ?? index)}>
                  <span>{String(item.kind ?? '')}</span>
                  <span className="moderation-queue-meta">{String(item.status ?? '')}</span>
                  <div className="moderation-actions">
                    {(['reviewing', 'accepted', 'denied'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            const result = await moderationSetAppealStatus(
                              String(item.id),
                              status,
                              `Marked ${status} in staff console`,
                            )
                            if (result.ok) void loadQueue('appeals')
                            return result
                          })
                        }
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {tab === 'audit' && (
          <ul className="moderation-queue">
            {audit.length === 0 && <li>No audit events.</li>}
            {audit.map((row, index) => {
              const item = row as Record<string, unknown>
              return (
                <li key={String(item.id ?? index)}>
                  <span>{String(item.action ?? '')}</span>
                  <span className="moderation-queue-meta">
                    {String(item.reason ?? '')} · {String(item.created_at ?? '')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {tab === 'status' && isOwner && (
          <div className="moderation-panel moderation-status-panel">
            <p className="auth-modal-intro">
              Owner-only maintenance banner, per-mode availability, and all-mode outage
              exemptions. Server enforces Owner role.
            </p>

            <label className="auth-field-label" htmlFor="mod-banner">
              Banner message
            </label>
            <textarea
              id="mod-banner"
              className="auth-modal-input moderation-reason"
              rows={2}
              value={bannerDraft}
              onChange={(e) => setBannerDraft(e.target.value)}
              disabled={busy}
            />
            <label className="auth-field-label" htmlFor="mod-banner-sev">
              Severity
            </label>
            <select
              id="mod-banner-sev"
              className="auth-modal-input"
              value={bannerSeverity}
              disabled={busy}
              onChange={(e) =>
                setBannerSeverity(e.target.value as 'info' | 'warning' | 'critical')
              }
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <label className="moderation-check">
              <input
                type="checkbox"
                checked={maintenance}
                disabled={busy}
                onChange={(e) => setMaintenance(e.target.checked)}
              />
              Maintenance active
            </label>
            <div className="moderation-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const result = await moderationSetSiteStatus({
                      bannerMessage: bannerDraft,
                      bannerSeverity,
                      maintenanceActive: maintenance,
                    })
                    if (result.ok) void loadQueue('status')
                    return result
                  })
                }
              >
                Save banner
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const result = await moderationSetSiteStatus({ clearBanner: true })
                    if (result.ok) void loadQueue('status')
                    return result
                  })
                }
              >
                Clear banner
              </button>
            </div>

            <h3 className="moderation-subtitle">Modes</h3>
            <ul className="moderation-queue">
              {(
                Array.isArray(siteStatus?.modes_full)
                  ? siteStatus.modes_full
                  : Array.isArray(siteStatus?.modes)
                    ? siteStatus.modes
                    : []
              ).map((row, index) => {
                const item = row as Record<string, unknown>
                const mode = String(item.mode ?? '')
                const available = item.available !== false
                return (
                  <li key={mode || index}>
                    <span>
                      {mode} · {available ? 'available' : 'offline'}
                      {item.required_for_all_mode === false ? ' · not required' : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || !mode}
                      onClick={() =>
                        void runAction(async () => {
                          const result = await moderationSetModeStatus({
                            mode,
                            available: !available,
                          })
                          if (result.ok) void loadQueue('status')
                          return result
                        })
                      }
                    >
                      {available ? 'Mark offline' : 'Mark available'}
                    </button>
                  </li>
                )
              })}
            </ul>

            <h3 className="moderation-subtitle">Outage exemption</h3>
            <label className="auth-field-label" htmlFor="mod-ex-date">
              UTC date (YYYY-MM-DD)
            </label>
            <input
              id="mod-ex-date"
              className="auth-modal-input"
              value={exemptionDate}
              onChange={(e) => setExemptionDate(e.target.value)}
              disabled={busy}
              placeholder="2026-07-18"
            />
            <label className="auth-field-label" htmlFor="mod-ex-mode">
              Mode
            </label>
            <select
              id="mod-ex-mode"
              className="auth-modal-input"
              value={exemptionMode}
              disabled={busy}
              onChange={(e) => setExemptionMode(e.target.value)}
            >
              <option value="summary">summary</option>
              <option value="character">character</option>
              <option value="cover">cover</option>
              <option value="heardle">heardle</option>
            </select>
            <label className="auth-field-label" htmlFor="mod-ex-reason">
              Reason
            </label>
            <input
              id="mod-ex-reason"
              className="auth-modal-input"
              value={exemptionReason}
              onChange={(e) => setExemptionReason(e.target.value)}
              disabled={busy}
            />
            <div className="moderation-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !exemptionDate.trim() || exemptionReason.trim().length < 3}
                onClick={() =>
                  void runAction(async () => {
                    const result = await moderationSetOutageExemption({
                      dateKey: exemptionDate.trim(),
                      mode: exemptionMode,
                      reason: exemptionReason,
                    })
                    if (result.ok) void loadQueue('status')
                    return result
                  })
                }
              >
                Add exemption
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !exemptionDate.trim()}
                onClick={() =>
                  void runAction(async () => {
                    const result = await moderationSetOutageExemption({
                      dateKey: exemptionDate.trim(),
                      mode: exemptionMode,
                      remove: true,
                    })
                    if (result.ok) void loadQueue('status')
                    return result
                  })
                }
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {tab === 'updates' && isOwner && (
          <ModerationUpdatesPanel
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            setNotice={setNotice}
          />
        )}
    </>
  )

  if (inline) {
    return <section className="staff-console-panel moderation-page-panel">{content}</section>
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="moderation-desc"
      backdropClassName="auth-backdrop"
      panelClassName="settings-modal moderation-modal"
      initialFocusRef={closeRef}
    >
      {content}
    </Dialog>
  )
}
