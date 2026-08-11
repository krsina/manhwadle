import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { deleteMyAccount, exportMyAccountData } from '../lib/profileApi'
import {
  USERNAME_MAX,
  USERNAME_MIN,
  formatNextChangeAt,
  usernameErrorMessage,
  validateUsernameClient,
} from '../lib/username'
import {
  ATTRIBUTION_PATH,
  MODERATION_POLICY_PATH,
  PRIVACY_PATH,
  TERMS_PATH,
} from '../lib/routes'

/** Account-only controls (no reading preference). Requires a signed-in user. */
export function AccountSettingsPanel() {
  const {
    user,
    account,
    accountLoading,
    changeUsername,
    signOut,
    refreshAccount,
  } = useAuth()
  const refreshAccountRef = useRef(refreshAccount)
  refreshAccountRef.current = refreshAccount
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setUsernameDraft('')
    setUsernameError(null)
    setUsernameNotice(null)
    setExportError(null)
    setDeleteOpen(false)
    setDeleteConfirm('')
    setDeleteError(null)
    if (user) void refreshAccountRef.current()
  }, [user])

  if (!user) return null

  const nextChangeLabel = formatNextChangeAt(account?.nextChangeAt)
  const canChange = Boolean(account?.canChangeUsername)

  async function handleUsernameSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canChange) return
    const client = validateUsernameClient(usernameDraft)
    if (!client.ok) {
      setUsernameError(usernameErrorMessage(client.error))
      return
    }
    setUsernameBusy(true)
    setUsernameError(null)
    setUsernameNotice(null)
    const result = await changeUsername(client.username)
    setUsernameBusy(false)
    if (result.error) {
      setUsernameError(result.error)
      return
    }
    setUsernameDraft('')
    setUsernameNotice('Username updated.')
  }

  async function handleExport() {
    setExportBusy(true)
    setExportError(null)
    const result = await exportMyAccountData()
    setExportBusy(false)
    if (!result.ok) {
      setExportError(result.error)
      return
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `manhwadle-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    setDeleteBusy(true)
    setDeleteError(null)
    const result = await deleteMyAccount('DELETE')
    setDeleteBusy(false)
    if (!result.ok) {
      setDeleteError(result.error)
      return
    }
    await signOut()
  }

  return (
    <div className="settings-panel">
      <section className="settings-section settings-section-first" aria-labelledby="settings-username-heading">
        <h2 id="settings-username-heading" className="settings-block-title">
          Username
        </h2>
        {accountLoading && !account ? (
          <p className="settings-muted">Loading account…</p>
        ) : (
          <>
            <p className="settings-row">
              Current:{' '}
              <strong className="auth-email-highlight">
                {account?.username ?? 'Not set'}
              </strong>
            </p>
            {canChange ? (
              <form className="auth-modal-form" onSubmit={(e) => void handleUsernameSubmit(e)}>
                <label className="auth-field-label" htmlFor="settings-username">
                  New username
                </label>
                <input
                  id="settings-username"
                  type="text"
                  autoComplete="username"
                  spellCheck={false}
                  maxLength={USERNAME_MAX}
                  placeholder={`${USERNAME_MIN}–${USERNAME_MAX} letters, numbers, _`}
                  value={usernameDraft}
                  onChange={(e) => {
                    setUsernameDraft(e.target.value)
                    if (usernameError) setUsernameError(null)
                  }}
                  className="auth-modal-input"
                  disabled={usernameBusy}
                />
                {usernameError && (
                  <p className="auth-modal-error" role="alert">
                    {usernameError}
                  </p>
                )}
                {usernameNotice && (
                  <p className="settings-notice" role="status">
                    {usernameNotice}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={usernameBusy || !usernameDraft.trim()}
                >
                  {usernameBusy ? 'Saving…' : 'Change username'}
                </button>
              </form>
            ) : (
              <p className="settings-muted">
                {nextChangeLabel
                  ? `You can change your username again after ${nextChangeLabel}.`
                  : 'Username changes are limited to once every 30 days.'}
              </p>
            )}
          </>
        )}
      </section>

      <section className="settings-section" aria-labelledby="settings-privacy-heading">
        <h2 id="settings-privacy-heading" className="settings-block-title">
          Privacy
        </h2>
        <p className="settings-muted">
          Manhwadle does not track anonymous guest play or run third-party product-analytics
          trackers. Game progress for signed-in accounts is stored in Supabase so levels,
          streaks, and the shop work.{' '}
          <Link to={PRIVACY_PATH}>Privacy</Link>
          {' · '}
          <Link to={TERMS_PATH}>Terms</Link>
          {' · '}
          <Link to={ATTRIBUTION_PATH}>Attribution</Link>
          {' · '}
          <Link to={MODERATION_POLICY_PATH}>Moderation</Link>
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" className="settings-block-title">
          Your data
        </h2>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={exportBusy}
            onClick={() => void handleExport()}
          >
            {exportBusy ? 'Exporting…' : 'Export account data'}
          </button>
          <button
            type="button"
            className="btn btn-ghost auth-sign-out-btn"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account…
          </button>
        </div>
        {exportError && (
          <p className="auth-modal-error" role="alert">
            {exportError}
          </p>
        )}

        {deleteOpen && (
          <div className="settings-danger" aria-labelledby="settings-delete-heading">
            <h3 id="settings-delete-heading" className="settings-section-title">
              Delete account
            </h3>
            <p className="settings-muted">
              This permanently removes your auth account and cascaded app data. Type{' '}
              <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              className="auth-modal-input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              disabled={deleteBusy}
              aria-label="Type DELETE to confirm account deletion"
            />
            {deleteError && (
              <p className="auth-modal-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={deleteBusy}
                onClick={() => void handleDelete()}
              >
                {deleteBusy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
