import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from './AuthProvider'

/** Compact optional sign-in (magic link). Hidden when Supabase env is missing. */
export function AuthButton() {
  const { user, configured, loading, signInWithMagicLink, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  if (!configured) return null

  if (loading) {
    return (
      <div className="auth-chip" aria-busy="true">
        <span className="auth-chip-label">…</span>
      </div>
    )
  }

  if (user) {
    const label = user.email?.split('@')[0] || 'Account'
    return (
      <>
        <button
          type="button"
          className="auth-chip auth-chip-signed auth-chip-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={user.email ?? 'Account'}
        >
          <span className="auth-chip-label">{label}</span>
        </button>
        {open && (
          <AccountModal
            email={user.email ?? null}
            onClose={() => setOpen(false)}
            onSignOut={async () => {
              await signOut()
              setOpen(false)
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        className="auth-chip-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Sign in
      </button>
      {open && (
        <SignInModal
          onClose={() => setOpen(false)}
          onSignIn={signInWithMagicLink}
        />
      )}
    </>
  )
}

function SignInModal({
  onClose,
  onSignIn,
}: {
  onClose: () => void
  onSignIn: (email: string) => Promise<{ error: string | null }>
}) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    inputRef.current?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setBusy(true)
    setError(null)
    const { error: nextError } = await onSignIn(trimmed)
    setBusy(false)
    if (nextError) {
      setError(nextError)
      return
    }
    setSentTo(trimmed)
  }

  return createPortal(
    <div className="modal-backdrop auth-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
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
              Enter your email and we&apos;ll send a one-time link — no password.
              Signing in syncs your streaks and progress across devices.
            </p>

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
                disabled={busy}
              />

              {error && (
                <p className="auth-modal-error" role="alert">
                  {error}
                </p>
              )}

              <div className="modal-actions auth-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !email.trim()}
                >
                  {busy ? 'Sending…' : 'Email me a link'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function AccountModal({
  email,
  onClose,
  onSignOut,
}: {
  email: string | null
  onClose: () => void
  onSignOut: () => Promise<void>
}) {
  const titleId = useId()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop auth-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
        <p className="modal-kicker">Account</p>
        <h2 id={titleId} className="modal-title">
          Signed in
        </h2>
        <p className="auth-modal-intro">
          {email ? (
            <>
              You&apos;re signed in as{' '}
              <strong className="auth-email-highlight">{email}</strong>. Progress stays synced
              while you&apos;re signed in.
            </>
          ) : (
            'Your progress stays synced while you are signed in.'
          )}
        </p>
        <div className="modal-actions auth-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
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
      </div>
    </div>,
    document.body,
  )
}
