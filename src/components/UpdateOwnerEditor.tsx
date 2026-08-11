import { useId, useState, type FormEvent } from 'react'
import { moderationUpsertSiteUpdate } from '../lib/moderationApi'
import {
  parseSiteUpdate,
  type SiteUpdate,
  type SiteUpdateKind,
} from '../lib/siteUpdatesApi'

interface UpdateOwnerEditorProps {
  update: SiteUpdate
  onCancel: () => void
  onSaved: (update: SiteUpdate) => void
}

/** Inline owner editor for a public News item. */
export function UpdateOwnerEditor({ update, onCancel, onSaved }: UpdateOwnerEditorProps) {
  const formId = useId()
  const [title, setTitle] = useState(update.title)
  const [body, setBody] = useState(update.body)
  const [version, setVersion] = useState(update.version ?? '')
  const [kind, setKind] = useState<SiteUpdateKind>(update.kind)
  const [published, setPublished] = useState(update.published)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await moderationUpsertSiteUpdate({
      id: update.id,
      title,
      body,
      version: version.trim() || null,
      kind,
      published,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const payload = result.data as { result?: { update?: unknown } }
    const next = parseSiteUpdate(payload.result?.update)
    if (!next) {
      setError('Saved, but the response looked unexpected. Refresh the page.')
      return
    }
    onSaved(next)
  }

  return (
    <form className="update-owner-editor" onSubmit={(e) => void handleSubmit(e)}>
      <label className="auth-field-label" htmlFor={`${formId}-kind`}>
        Type
      </label>
      <select
        id={`${formId}-kind`}
        className="auth-modal-input"
        value={kind}
        onChange={(e) => setKind(e.target.value as SiteUpdateKind)}
        disabled={busy}
      >
        <option value="update">Release update</option>
        <option value="announcement">Announcement</option>
      </select>
      <label className="auth-field-label" htmlFor={`${formId}-version`}>
        Version {kind === 'announcement' ? '(optional)' : ''}
      </label>
      <input
        id={`${formId}-version`}
        className="auth-modal-input"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="0.2.0"
        pattern="^[0-9]+\.[0-9]+\.[0-9]+$"
        title="Use MAJOR.MINOR.PATCH"
        required={published && kind === 'update'}
        disabled={busy}
      />
      <label className="auth-field-label" htmlFor={`${formId}-title`}>
        Title
      </label>
      <input
        id={`${formId}-title`}
        className="auth-modal-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        disabled={busy}
      />
      <label className="auth-field-label" htmlFor={`${formId}-body`}>
        Body
      </label>
      <textarea
        id={`${formId}-body`}
        className="auth-modal-input moderation-reason"
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={20000}
        required
        disabled={busy}
      />
      <label className="moderation-check">
        <input
          type="checkbox"
          checked={published}
          disabled={busy}
          onChange={(e) => setPublished(e.target.checked)}
        />
        Published
      </label>
      {error && (
        <p className="auth-modal-error" role="alert">
          {error}
        </p>
      )}
      <div className="moderation-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
