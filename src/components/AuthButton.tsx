import { useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type AuthOAuthProvider } from './AuthProvider'
import { Dialog } from './Dialog'
import { ModerationDashboard } from './ModerationDashboard'
import { canUseModerationUi } from '../lib/moderationApi'
import { SETTINGS_PATH } from '../lib/routes'
import { telemetry } from '../lib/telemetry'

const OAUTH_PROVIDERS: {
  id: AuthOAuthProvider
  label: string
  icon: 'google' | 'discord'
}[] = [
  { id: 'google', label: 'Continue with Google', icon: 'google' },
  { id: 'discord', label: 'Continue with Discord', icon: 'discord' },
]

/** Compact optional sign-in. Hidden when Supabase env is missing. */
export function AuthButton() {
  const { user, account, configured, loading, signInWithMagicLink, signInWithOAuth, signOut } =
    useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [moderationOpen, setModerationOpen] = useState(false)

  if (!configured) return null

  if (loading) {
    return (
      <div className="auth-chip auth-chip-loading" aria-busy="true">
        <span className="auth-avatar" aria-hidden="true" />
        <span className="auth-chip-label">…</span>
      </div>
    )
  }

  if (user) {
    const label = account?.username || 'Account'
    return (
      <>
        <button
          type="button"
          className="auth-chip auth-chip-signed auth-chip-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={account?.username ? `@${account.username}` : (user.email ?? 'Account')}
        >
          <span className="auth-avatar" aria-hidden="true">
            {label.charAt(0).toUpperCase()}
          </span>
          <span className="auth-chip-label">{label}</span>
          <ChevronIcon />
        </button>
        {open && (
          <AccountModal
            email={user.email ?? null}
            username={account?.username ?? null}
            staffRole={account?.staffRole ?? null}
            cloudBanned={Boolean(account?.cloudBanned)}
            onClose={() => setOpen(false)}
            onOpenSettings={() => {
              setOpen(false)
              navigate(SETTINGS_PATH)
            }}
            onOpenModeration={
              canUseModerationUi(account?.staffRole)
                ? () => {
                    setOpen(false)
                    setModerationOpen(true)
                  }
                : undefined
            }
            onSignOut={async () => {
              await signOut()
              setOpen(false)
            }}
          />
        )}
        <ModerationDashboard
          open={moderationOpen}
          onClose={() => setModerationOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        className="auth-chip-btn"
        onClick={() => {
          telemetry.authPrompt('unknown')
          setOpen(true)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <AccountIcon />
        Sign in
      </button>
      {open && (
        <SignInModal
          onClose={() => setOpen(false)}
          onSignIn={signInWithMagicLink}
          onOAuth={signInWithOAuth}
        />
      )}
    </>
  )
}

function AccountIcon() {
  return (
    <svg className="auth-account-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 19c.7-3.2 3-5 6.5-5s5.8 1.8 6.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="auth-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="m4.5 6 3.5 3.5L11.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SignInModal({
  onClose,
  onSignIn,
  onOAuth,
}: {
  onClose: () => void
  onSignIn: (email: string) => Promise<{ error: string | null }>
  onOAuth: (provider: AuthOAuthProvider) => Promise<{ error: string | null }>
}) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<AuthOAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const anyBusy = busy || oauthBusy !== null

  // Focus + Escape handled by Dialog

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setBusy(true)
    setError(null)
    telemetry.authStart('email')
    const { error: nextError } = await onSignIn(trimmed)
    setBusy(false)
    if (nextError) {
      setError(nextError)
      return
    }
    setSentTo(trimmed)
  }

  async function handleOAuth(provider: AuthOAuthProvider) {
    setOauthBusy(provider)
    setError(null)
    telemetry.authStart('oauth')
    const { error: nextError } = await onOAuth(provider)
    // On success the browser redirects away; only clear busy on failure.
    if (nextError) {
      setOauthBusy(null)
      setError(nextError)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      titleId={titleId}
      descriptionId="auth-sign-in-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal"
      initialFocusRef={inputRef}
    >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>

        {sentTo ? (
          <>
            <p className="modal-kicker">Check your inbox</p>
            <h2 id={titleId} className="modal-title">
              Link sent
            </h2>
            <p className="auth-modal-intro">
              We emailed a sign-in link to <strong className="auth-email-highlight">{sentTo}</strong>.
              Open it on this device to finish signing in. The link expires after a short time.
            </p>
            <div className="modal-actions auth-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSentTo(null)
                  setError(null)
                }}
              >
                Use a different email
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-kicker">Account</p>
            <h2 id={titleId} className="modal-title">
              Sign in
            </h2>
            <p className="auth-modal-intro">
              Sync streaks and progress across devices. Sign in with a provider, or get a
              one-time email link — no password.
            </p>

            <div className="auth-oauth-list">
              {OAUTH_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`btn auth-oauth-btn auth-oauth-${provider.icon}`}
                  disabled={anyBusy}
                  onClick={() => void handleOAuth(provider.id)}
                >
                  <OAuthIcon name={provider.icon} />
                  <span>
                    {oauthBusy === provider.id ? 'Redirecting…' : provider.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="auth-divider" role="separator">
              <span>or continue with email</span>
            </div>

            <form className="auth-modal-form" onSubmit={(e) => void handleSubmit(e)}>
              <label className="auth-field-label" htmlFor="auth-email">
                Email
              </label>
              <input
                ref={inputRef}
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-modal-input"
                disabled={anyBusy}
              />

              {error && (
                <p className="auth-modal-error" role="alert">
                  {error}
                </p>
              )}

              <div className="modal-actions auth-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={anyBusy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={anyBusy || !email.trim()}
                >
                  {busy ? 'Sending…' : 'Email me a link'}
                </button>
              </div>
            </form>
          </>
        )}
    </Dialog>
  )
}

function AccountModal({
  email,
  username,
  staffRole,
  cloudBanned,
  onClose,
  onOpenSettings,
  onOpenModeration,
  onSignOut,
}: {
  email: string | null
  username: string | null
  staffRole: string | null
  cloudBanned: boolean
  onClose: () => void
  onOpenSettings: () => void
  onOpenModeration?: () => void
  onSignOut: () => Promise<void>
}) {
  const titleId = useId()
  const [busy, setBusy] = useState(false)

  return (
    <Dialog
      open
      onClose={onClose}
      titleId={titleId}
      descriptionId="auth-account-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal"
    >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
        <p className="modal-kicker">Account</p>
        <h2 id={titleId} className="modal-title">
          Signed in
        </h2>
        <p className="auth-modal-intro">
          {username ? (
            <>
              Playing as <strong className="auth-email-highlight">{username}</strong>
              {email ? (
                <>
                  {' '}
                  ({email}).
                </>
              ) : (
                '.'
              )}{' '}
              Progress stays synced while you&apos;re signed in.
            </>
          ) : email ? (
            <>
              You&apos;re signed in as{' '}
              <strong className="auth-email-highlight">{email}</strong>. Finish choosing a
              username to join public features.
            </>
          ) : (
            'Your progress stays synced while you are signed in.'
          )}
        </p>
        {cloudBanned && (
          <p className="auth-modal-error" role="status">
            Cloud sync writes are disabled for this account. You can still play locally and
            read existing synced data.
          </p>
        )}
        <div className="modal-actions auth-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onOpenSettings} disabled={busy}>
            Account settings
          </button>
          {onOpenModeration && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onOpenModeration}
              disabled={busy}
            >
              Moderation{staffRole ? ` (${staffRole})` : ''}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost auth-sign-out-btn"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onSignOut().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
    </Dialog>
  )
}

function OAuthIcon({ name }: { name: 'google' | 'discord' }) {
  if (name === 'google') {
    return (
      <svg className="auth-oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
        />
        <path
          fill="#34A853"
          d="M6.6 14.3l-.8.6-2.5 1.9C5 19.4 8.2 21.4 12 21.4c2.4 0 4.4-.8 5.9-2.1l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z"
        />
        <path
          fill="#4A90E2"
          d="M3.3 7.2C2.5 8.7 2 10.3 2 12s.5 3.3 1.3 4.8l3.3-2.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.3 7.2z"
        />
        <path
          fill="#FBBC05"
          d="M12 5.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.7 14.4 2 12 2 8.2 2 5 4 3.3 7.2l3.3 2.5C7.9 7.1 9.8 5.6 12 5.6z"
        />
      </svg>
    )
  }

  return (
    <svg className="auth-oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.3 4.4A19 19 0 0 0 15.6 3l-.2.4a17.5 17.5 0 0 1 4 1.9 15.8 15.8 0 0 0-14.8 0A17.5 17.5 0 0 1 8.6 3.4L8.4 3a19 19 0 0 0-4.7 1.4C.8 8.3.1 12.1.4 15.9A19.2 19.2 0 0 0 6 18.7l.7-1a12.3 12.3 0 0 1-1.1-.5l.3-.2c2.2 1 4.6 1.5 7 1.5s4.8-.5 7-1.5l.3.2c-.3.2-.7.4-1.1.5l.7 1a19.2 19.2 0 0 0 5.6-2.8c.4-4.3-.7-8-2.4-11.5ZM8.3 14.2c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8Zm7.4 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8Z"
      />
    </svg>
  )
}
