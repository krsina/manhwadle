import { Link } from 'react-router-dom'
import { AccountSettingsPanel } from '../components/AccountSettingsPanel'

/** Signed-in account settings (username, privacy, data). No reading preference. */
export function SettingsPage() {
  return (
    <div className="settings-page">
      <p className="settings-page-back">
        <Link to="/">← Home</Link>
      </p>
      <header className="settings-page-head">
        <h1 className="settings-page-title">Account settings</h1>
        <p className="settings-page-blurb">
          Username, privacy, and account data.
        </p>
      </header>
      <AccountSettingsPanel />
    </div>
  )
}
