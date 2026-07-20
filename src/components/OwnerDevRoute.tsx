import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'
import { HOME_PATH } from '../lib/routes'

/** Renders children only for the signed-in owner in a Vite DEV build (not user mode). */
export function OwnerDevRoute({ children }: { children: ReactNode }) {
  const { loading, accountLoading } = useAuth()
  const { ownerDev } = useOwnerDevAccess()
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
