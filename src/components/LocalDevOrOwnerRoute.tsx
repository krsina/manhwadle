import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'
import { HOME_PATH } from '../lib/routes'

/**
 * Local Vite DEV: always open (even signed out).
 * Non-DEV builds: owner DEV session only.
 */
export function LocalDevOrOwnerRoute({ children }: { children: ReactNode }) {
  const { loading, accountLoading } = useAuth()
  const { ownerDev } = useOwnerDevAccess()

  if (import.meta.env.DEV) return children

  if (loading || accountLoading) {
    return (
      <div className="route-fallback" role="status" aria-live="polite">
        Loading…
      </div>
    )
  }
  if (!ownerDev) {
    return <Navigate to={HOME_PATH} replace />
  }
  return children
}
