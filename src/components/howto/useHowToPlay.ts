import { useState } from 'react'

/** Manual open/close for the how-to dialog (no auto-popup). */
export function useHowToPlay() {
  const [open, setOpen] = useState(false)

  function openHowTo() {
    setOpen(true)
  }

  function closeHowTo() {
    setOpen(false)
  }

  return { open, openHowTo, closeHowTo }
}
