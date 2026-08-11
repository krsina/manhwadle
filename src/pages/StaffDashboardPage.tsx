import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'
import { ModerationDashboard } from '../components/ModerationDashboard'
import { ModerationCommentsPanel } from '../components/ModerationCommentsPanel'
import {
  STAFF_ANALYTICS_PATH,
  STAFF_COMMENTS_PATH,
  STAFF_MODERATION_PATH,
  STAFF_PATH,
} from '../lib/routes'

export function StaffDashboardPage() {
  const { account } = useAuth()
  const location = useLocation()
  const isOwner = account?.staffRole === 'owner'

  if (location.pathname === STAFF_PATH || location.pathname === `${STAFF_PATH}/`) {
    return <Navigate to={isOwner ? STAFF_ANALYTICS_PATH : STAFF_MODERATION_PATH} replace />
  }

  return (
    <main className="staff-page">
      <header className="staff-page-header">
        <div>
          <p className="modal-kicker">Private staff area</p>
          <h1>Manhwadle operations</h1>
          <p>
            Signed in as {account?.staffRole}. Server authorization is checked for every request.
          </p>
        </div>
      </header>
      <nav className="staff-nav" aria-label="Staff dashboard">
        {isOwner && (
          <NavLink to={STAFF_ANALYTICS_PATH} className="btn btn-ghost">
            Analytics
          </NavLink>
        )}
        <NavLink to={STAFF_MODERATION_PATH} className="btn btn-ghost">
          Moderation
        </NavLink>
        <NavLink to={STAFF_COMMENTS_PATH} className="btn btn-ghost">
          Comments
        </NavLink>
      </nav>
      <Outlet />
    </main>
  )
}

export function StaffModerationPage() {
  return <ModerationDashboard inline />
}

export function StaffCommentsPage() {
  return <ModerationCommentsPanel />
}
