import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  UpdateArticle,
  UpdatesBackLink,
} from '../components/UpdateArticle'
import { UPDATES_PATH } from '../lib/routes'
import {
  fetchPublicSiteUpdate,
  type SiteUpdate,
} from '../lib/siteUpdatesApi'
import { useLegalSecretPing } from '../lib/useSecretPagePings'

export function UpdateDetailPage() {
  useLegalSecretPing()
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const [update, setUpdate] = useState<SiteUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      setUpdate(null)
      if (!slug) {
        setError('not_found')
        setLoading(false)
        return
      }
      const result = await fetchPublicSiteUpdate(slug)
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setUpdate(result.update)
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="legal-page updates-page">
      <UpdatesBackLink />
      {loading && (
        <p className="updates-status" role="status">
          Loading update…
        </p>
      )}
      {!loading && error && (
        <>
          <h1 className="legal-title">Update not found</h1>
          <p className="legal-updated">
            This update may be unpublished or the link is out of date.
          </p>
        </>
      )}
      {!loading && update && (
        <>
          <h1 className="legal-title visually-hidden">{update.title}</h1>
          <UpdateArticle
            update={update}
            onUpdated={(next) => {
              if (!next.published) {
                void navigate(UPDATES_PATH)
                return
              }
              setUpdate(next)
              if (next.slug !== slug) {
                void navigate(`/updates/${encodeURIComponent(next.slug)}`, { replace: true })
              }
            }}
          />
        </>
      )}
    </div>
  )
}
