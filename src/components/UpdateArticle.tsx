import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { UpdateOwnerEditor } from './UpdateOwnerEditor'
import {
  canUseModerationUi,
} from '../lib/moderationApi'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'
import {
  formatUpdateDate,
  splitUpdateBody,
  type SiteUpdate,
} from '../lib/siteUpdatesApi'
import { UPDATES_PATH, updatesPath } from '../lib/routes'

export function UpdateBody({ body }: { body: string }) {
  const blocks = splitUpdateBody(body)
  return (
    <div className="update-body">
      {blocks.map((block, index) => (
        <p key={index}>{block}</p>
      ))}
    </div>
  )
}

export function UpdateArticle({
  update,
  linkTitle = false,
  onUpdated,
}: {
  update: SiteUpdate
  linkTitle?: boolean
  onUpdated?: (update: SiteUpdate) => void
}) {
  const { account } = useAuth()
  const { showUserModeToggle, userMode } = useOwnerDevAccess()
  const canEdit =
    canUseModerationUi(account?.staffRole) && !(showUserModeToggle && userMode)
  const [editing, setEditing] = useState(false)
  const dateLabel = formatUpdateDate(update.publishedAt ?? update.createdAt)

  if (editing && canEdit) {
    return (
      <article className="update-entry is-editing">
        <UpdateOwnerEditor
          update={update}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false)
            onUpdated?.(next)
          }}
        />
      </article>
    )
  }

  return (
    <article className="update-entry">
      <header className="update-entry-header">
        <div className="update-entry-heading">
          <h2 className="update-entry-title">
            {linkTitle ? (
              <Link to={updatesPath(update.slug)}>{update.title}</Link>
            ) : (
              update.title
            )}
          </h2>
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost update-edit-btn"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
        </div>
        {(update.version || dateLabel) && (
          <p className="update-entry-meta">
            {update.version && <span className="update-entry-version">v{update.version}</span>}
            {update.version && dateLabel ? (
              <span className="update-entry-meta-sep" aria-hidden="true">
                ·
              </span>
            ) : null}
            {dateLabel && (
              <time
                className="update-entry-date"
                dateTime={update.publishedAt ?? update.createdAt}
              >
                {dateLabel}
              </time>
            )}
          </p>
        )}
      </header>
      <UpdateBody body={update.body} />
    </article>
  )
}

export function UpdatesEmptyState() {
  return (
    <p className="updates-empty">
      No published updates yet. Check back after the next site change.
    </p>
  )
}

export function UpdatesBackLink() {
  return (
    <p className="updates-back">
      <Link to={UPDATES_PATH}>← All updates</Link>
    </p>
  )
}
