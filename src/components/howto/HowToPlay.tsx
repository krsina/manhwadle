import type { HowToPlayGuide } from '../../lib/howto'
import { HowToPlayButton } from './HowToPlayButton'
import { HowToPlayModal } from './HowToPlayModal'
import { useHowToPlay } from './useHowToPlay'

interface HowToPlayProps {
  /** Stable mode id — used for per-mode “seen” storage */
  modeId: string
  guide: HowToPlayGuide
}

/**
 * Drop-in how-to for any game mode: auto-opens once for first-time visitors,
 * and exposes a “?” button to reopen later.
 */
export function HowToPlay({ modeId, guide }: HowToPlayProps) {
  const { open, openHowTo, closeHowTo } = useHowToPlay(modeId)

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
