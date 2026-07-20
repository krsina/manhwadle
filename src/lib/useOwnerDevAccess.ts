import { useEffect, useState } from 'react'
import { useAuth } from '../components/AuthProvider'
import {
  canShowOwnerUserModeToggle,
  canUseOwnerDevUi,
  isOwnerUserModeEnabled,
  OWNER_USER_MODE_EVENT,
  setOwnerUserModeEnabled,
} from './devAccess'

/** Reactive owner DEV / user-mode access for UI gates. */
export function useOwnerDevAccess() {
  const { account } = useAuth()
  const [, setTick] = useState(0)

  useEffect(() => {
    function onChange() {
      setTick((n) => n + 1)
    }
    window.addEventListener(OWNER_USER_MODE_EVENT, onChange)
    return () => window.removeEventListener(OWNER_USER_MODE_EVENT, onChange)
  }, [])

  const role = account?.staffRole ?? null
  return {
    showUserModeToggle: canShowOwnerUserModeToggle(role),
    userMode: isOwnerUserModeEnabled(),
    ownerDev: canUseOwnerDevUi(role),
    setUserMode: setOwnerUserModeEnabled,
  }
}
