import { Navigate } from 'react-router-dom'
import { AccountSettingsPanel } from '../components/AccountSettingsPanel'
import { useAuth } from '../components/AuthProvider'

/** Signed-in account settings (username, privacy, data). No reading preference. */
export function SettingsPage() {
  const { user, configured, loading } = useAuth()

  if (!loading && configured && !user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <h1 className="settings-page-title">Account settings</h1>
        <p className="settings-page-blurb">Username, privacy, and account data.</p>
      </header>
      {loading ? (
        <p className="settings-muted">Loading…</p>
      ) : (
        <AccountSettingsPanel />
      )}
    </div>
  )
}
