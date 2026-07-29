import { useEffect, useState, type FormEvent } from 'react'
import {
  moderationDeleteSiteUpdate,
  moderationListSiteUpdates,
  moderationUpsertSiteUpdate,
} from '../lib/moderationApi'
import { updatesPath } from '../lib/routes'
import {
  formatUpdateDate,
  parseSiteUpdate,
  type SiteUpdate,
} from '../lib/siteUpdatesApi'

interface ModerationUpdatesPanelProps {
  busy: boolean
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setNotice: (notice: string | null) => void
}

/** Owner-only changelog authoring for /updates. */
export function ModerationUpdatesPanel({
  busy,
  setBusy,
  setError,
  setNotice,
}: ModerationUpdatesPanelProps) {
  const [updates, setUpdates] = useState<SiteUpdate[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [slug, setSlug] = useState('')
  const [version, setVersion] = useState('')
  const [published, setPublished] = useState(true)

  async function reload() {
    setBusy(true)
    setError(null)
    const result = await moderationListSiteUpdates()
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const payload = result.data as { result?: { updates?: unknown } }
    const rows = payload.result?.updates
    if (!Array.isArray(rows)) {
      setUpdates([])
      return
    }
    setUpdates(rows.map(parseSiteUpdate).filter((row): row is SiteUpdate => row !== null))
  }

  useEffect(() => {
    void reload()
    // Load once when the Updates tab panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setSlug('')
    setVersion('')
    setPublished(true)
  }

  function startEdit(update: SiteUpdate) {
    setEditingId(update.id)
    setTitle(update.title)
    setBody(update.body)
    setSlug(update.slug)
    setVersion(update.version ?? '')
    setPublished(update.published)
    setNotice(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await moderationUpsertSiteUpdate({
      id: editingId,
      title,
      body,
      slug: slug.trim() || null,
      version: version.trim() || null,
      published,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(editingId ? 'Update saved.' : 'Update created.')
    resetForm()
    await reload()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this update permanently?')) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await moderationDeleteSiteUpdate(id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice('Update deleted.')
    if (editingId === id) resetForm()
    await reload()
  }

  async function handleTogglePublish(update: SiteUpdate) {
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await moderationUpsertSiteUpdate({
      id: update.id,
      title: update.title,
      body: update.body,
      version: update.version,
      published: !update.published,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(update.published ? 'Update unpublished.' : 'Update published.')
    await reload()
  }

  const editingFrozenSlug = Boolean(
    editingId && updates.find((u) => u.id === editingId)?.publishedAt,
  )

  return (
    <div className="moderation-panel moderation-updates-panel">
      <p className="auth-modal-intro">
        Publish changelog entries for the public Updates page. Plain text; blank lines
        become paragraphs. Include a semver version for published posts. Slugs auto-generate
        from the title and freeze after first publish.
      </p>

      <form className="moderation-update-form" onSubmit={(e) => void handleSubmit(e)}>
        <h3 className="moderation-subtitle">
          {editingId ? 'Edit update' : 'New update'}
        </h3>
        <label className="auth-field-label" htmlFor="mod-update-version">
          Version
        </label>
        <input
          id="mod-update-version"
          className="auth-modal-input"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="0.2.0"
          pattern="^[0-9]+\.[0-9]+\.[0-9]+$"
          title="Use MAJOR.MINOR.PATCH"
          required={published}
          disabled={busy}
        />
        <label className="auth-field-label" htmlFor="mod-update-title">
          Title
        </label>
        <input
          id="mod-update-title"
          className="auth-modal-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          disabled={busy}
        />
        <label className="auth-field-label" htmlFor="mod-update-slug">
          Slug (optional)
        </label>
        <input
          id="mod-update-slug"
          className="auth-modal-input"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          maxLength={120}
          placeholder="auto-from-title"
          disabled={busy || editingFrozenSlug}
        />
        <label className="auth-field-label" htmlFor="mod-update-body">
          Body
        </label>
        <textarea
          id="mod-update-body"
          className="auth-modal-input moderation-reason"
          rows={6}
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
          Published (visible on /updates)
        </label>
        <div className="moderation-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {editingId ? 'Save changes' : 'Create update'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={resetForm}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <h3 className="moderation-subtitle">All updates</h3>
      {updates.length === 0 ? (
        <p className="moderation-queue-meta">No updates yet.</p>
      ) : (
        <ul className="moderation-queue">
          {updates.map((update) => (
            <li key={update.id}>
              <strong>{update.title}</strong>
              <span className="moderation-queue-meta">
                {update.version ? `v${update.version} · ` : ''}
                {update.published ? 'Published' : 'Draft'}
                {update.publishedAt
                  ? ` · ${formatUpdateDate(update.publishedAt)}`
                  : ''}
                {' · '}
                /updates/{update.slug}
              </span>
              <div className="moderation-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => startEdit(update)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void handleTogglePublish(update)}
                >
                  {update.published ? 'Unpublish' : 'Publish'}
                </button>
                {update.published && (
                  <a
                    className="btn btn-ghost"
                    href={updatesPath(update.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void handleDelete(update.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
