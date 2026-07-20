import { useEffect, useState } from 'react'
import {
  subscribeAnnouncements,
  type AnnouncementPriority,
} from '../lib/appAnnouncer'

/** Global aria-live region for status / sync / error announcements. */
export function AppAnnouncer() {
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState<AnnouncementPriority>('polite')

  useEffect(() => {
    return subscribeAnnouncements((next, nextPriority) => {
      // Retrigger SR announcement when the same string repeats.
      setMessage('')
      window.requestAnimationFrame(() => {
        setPriority(nextPriority)
        setMessage(next)
      })
    })
  }, [])

  return (
    <div className="visually-hidden" aria-live={priority} aria-atomic="true" role="status">
      {message}
    </div>
  )
}
