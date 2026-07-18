import { useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { Dialog } from './Dialog'
import {
  USERNAME_MAX,
  USERNAME_MIN,
  usernameErrorMessage,
  validateUsernameClient,
} from '../lib/username'

/** Blocking modal after sign-in until a username is claimed (or forced rename). */
export function UsernameOnboarding() {
  const { user, account, needsUsername, accountLoading, claimUsername } = useAuth()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const forced = Boolean(account?.usernameChangeRequired)
  const open = Boolean(user && needsUsername && !accountLoading)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const client = validateUsernameClient(draft)
    if (!client.ok) {
      setError(usernameErrorMessage(client.error))
      return
    }
    setBusy(true)
    setError(null)
    const { error: nextError } = await claimUsername(client.username)
    setBusy(false)
    if (nextError) setError(nextError)
  }

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      titleId={titleId}
      descriptionId="onboarding-desc"
      backdropClassName="auth-backdrop"
      panelClassName="auth-modal"
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
    >
      <p className="modal-kicker">{forced ? 'Required' : 'Almost there'}</p>
      <h2 id={titleId} className="modal-title">
        {forced ? 'Choose a new username' : 'Choose a username'}
      </h2>
      <p id="onboarding-desc" className="auth-modal-intro">
        {forced ? (
          <>
            A moderator asked you to pick a new public username. Your previous name is
            hidden until you continue. This replacement does not start the 30-day change
            cooldown.
          </>
        ) : (
          <>
            Pick a public name for Top Rankings and community features. You can change it
            later from Settings (once every 30 days).
          </>
        )}
      </p>
      {account?.cloudBanned && (
        <p className="auth-modal-error" role="status">
          Your account is cloud-banned. Local play still works; cloud sync and public
          features stay limited. You may still set a required username.
        </p>
      )}
      <form className="auth-modal-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="auth-field-label" htmlFor="onboarding-username">
          Username
        </label>
        <input
          ref={inputRef}
          id="onboarding-username"
          type="text"
          autoComplete="username"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          placeholder={`letters, numbers, _ (${USERNAME_MIN}–${USERNAME_MAX})`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          className="auth-modal-input"
          disabled={busy}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'onboarding-username-error' : undefined}
          data-dialog-initial-focus
        />
        {error && (
          <p id="onboarding-username-error" className="auth-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions auth-modal-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !draft.trim()}
          >
            {busy ? 'Saving…' : forced ? 'Save new username' : 'Continue'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
