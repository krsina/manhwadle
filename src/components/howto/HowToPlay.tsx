import type { HowToPlayGuide } from '../../lib/howto'
import { HowToPlayButton } from './HowToPlayButton'
import { HowToPlayModal } from './HowToPlayModal'
import { useHowToPlay } from './useHowToPlay'

interface HowToPlayProps {
  /** Kept for call-site compatibility; how-to no longer auto-opens per mode. */
  modeId?: string
  guide: HowToPlayGuide
}

/**
 * Drop-in how-to for any game mode: “?” button opens the guide on demand.
 */
export function HowToPlay({ guide }: HowToPlayProps) {
  const { open, openHowTo, closeHowTo } = useHowToPlay()

  return (
    <>
      <HowToPlayButton onClick={openHowTo} />
      <HowToPlayModal open={open} guide={guide} onClose={closeHowTo} />
    </>
  )
}

export { HowToPlayButton } from './HowToPlayButton'
export { HowToPlayModal } from './HowToPlayModal'
export { useHowToPlay } from './useHowToPlay'
