import { useEffect, useState } from 'react'
import {
  UpdateArticle,
  UpdatesEmptyState,
} from '../components/UpdateArticle'
import {
  fetchPublicSiteUpdates,
  type SiteUpdate,
} from '../lib/siteUpdatesApi'
import { useLegalSecretPing } from '../lib/useSecretPagePings'

export function UpdatesPage() {
  useLegalSecretPing()
  const [updates, setUpdates] = useState<SiteUpdate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchPublicSiteUpdates()
      if (cancelled) return
      if (!result.ok) {
        setError(result.error === 'unconfigured' ? 'unavailable' : result.error)
        setUpdates([])
        return
      }
      setUpdates(result.updates)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="legal-page updates-page">
      <h1 className="legal-title">News</h1>
      <p className="legal-updated">
        Announcements, release updates, fixes, and feature notes from Manhwadle.
      </p>

      {updates === null && (
        <p className="updates-status" role="status">
          Loading news…
        </p>
      )}

      {error && (
        <p className="auth-modal-error" role="alert">
          Could not load news right now.
        </p>
      )}

      {updates && updates.length === 0 && !error && <UpdatesEmptyState />}

      {updates && updates.length > 0 && (
        <div className="updates-list">
          {updates.map((update) => (
            <UpdateArticle
              key={update.id}
              update={update}
              linkTitle
              onUpdated={(next) => {
                setUpdates((prev) => {
                  if (!prev) return prev
                  if (!next.published) return prev.filter((row) => row.id !== next.id)
                  return prev.map((row) => (row.id === next.id ? next : row))
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
