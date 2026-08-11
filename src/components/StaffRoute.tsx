import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { HOME_PATH, STAFF_MODERATION_PATH } from '../lib/routes'

export function StaffRoute({
  children,
  ownerOnly = false,
}: {
  children: ReactNode
  ownerOnly?: boolean
}) {
  const { loading, accountLoading, account } = useAuth()

  if (loading || accountLoading) {
    return (
      <div className="route-fallback" role="status" aria-live="polite">
        Loading…
      </div>
    )
  }

  const role = account?.staffRole
  if (role !== 'owner' && role !== 'moderator') {
    return <Navigate to={HOME_PATH} replace />
  }
  if (ownerOnly && role !== 'owner') {
    return <Navigate to={STAFF_MODERATION_PATH} replace />
  }

  return children
}
