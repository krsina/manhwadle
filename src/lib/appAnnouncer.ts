/**
 * Application-level polite/assertive announcements for status, sync, and errors.
 * Screen readers pick these up via a single live region in the layout.
 */

export type AnnouncementPriority = 'polite' | 'assertive'

type Listener = (message: string, priority: AnnouncementPriority) => void

const listeners = new Set<Listener>()
let lastMessage = ''
let lastPriority: AnnouncementPriority = 'polite'

export function announce(message: string, priority: AnnouncementPriority = 'polite'): void {
  const text = message.trim()
  if (!text) return
  lastMessage = text
  lastPriority = priority
  for (const listener of listeners) listener(text, priority)
}

export function subscribeAnnouncements(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test / bootstrap helper. */
export function getLastAnnouncement(): { message: string; priority: AnnouncementPriority } {
  return { message: lastMessage, priority: lastPriority }
}

export function clearAnnouncementsForTests(): void {
  lastMessage = ''
  lastPriority = 'polite'
}
