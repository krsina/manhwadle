import { useEffect, useState } from 'react'
import { announce } from '../lib/appAnnouncer'

type Connectivity = 'online' | 'offline'

/**
 * Accessible offline / network indicator.
 * Informational only — never blocks anonymous local play.
 */
export function NetworkStatus() {
  const [connectivity, setConnectivity] = useState<Connectivity>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  )

  useEffect(() => {
    function onOnline() {
      setConnectivity('online')
      announce('Back online. Local play continues; cloud sync can resume.')
    }
    function onOffline() {
      setConnectivity('offline')
      announce(
        'You are offline. Local play still works on this device.',
        'assertive',
      )
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (connectivity !== 'offline') return null

  return (
    <div
      className="network-status is-offline"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="network-status-text">
        You are offline. Local play still works; cloud features will retry when you
        reconnect.
      </p>
    </div>
  )
}
