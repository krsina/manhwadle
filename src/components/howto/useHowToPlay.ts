import { useState } from 'react'
import { hasSeenHowTo, markHowToSeen } from '../../lib/howto'

/** Open state + first-visit auto-open, keyed per mode id. */
export function useHowToPlay(modeId: string) {
  const [open, setOpen] = useState(() => !hasSeenHowTo(modeId))

  function openHowTo() {
    setOpen(true)
  }

  function closeHowTo() {
    markHowToSeen(modeId)
    setOpen(false)
  }

  return { open, openHowTo, closeHowTo }
}
