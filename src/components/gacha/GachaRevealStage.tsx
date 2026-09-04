import { useCallback, useEffect, useRef, useState } from 'react'
import type { GachaRollResult } from '../../lib/gacha'
import { GACHA_CAROUSEL_MS } from '../../lib/gachaMotion'
import { GachaCarousel } from './GachaCarousel'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function GachaRevealStage({
  result,
  playId,
  skip,
  muted = false,
  onComplete,
}: {
  result: GachaRollResult
  playId: number
  skip: boolean
  muted?: boolean
  onComplete: () => void
}) {
  const skipMotion = skip || prefersReducedMotion()
  const finishedPlayId = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const [landedPlayId, setLandedPlayId] = useState<number | null>(null)

  const finish = useCallback(() => {
    if (finishedPlayId.current === playId) return
    finishedPlayId.current = playId
    setLandedPlayId(playId)
    onCompleteRef.current()
  }, [playId])

  useEffect(() => {
    const timer = window.setTimeout(finish, skipMotion ? 0 : GACHA_CAROUSEL_MS + 400)
    return () => window.clearTimeout(timer)
  }, [finish, playId, skipMotion])

  const revealed = skipMotion || landedPlayId === playId

  return (
    <section
      className={`gacha-reveal${revealed ? ` is-landed is-${result.rarity}` : ' is-spinning'}`}
      aria-live="polite"
    >
      <div className="gacha-reveal-stage">
        <GachaCarousel
          key={playId}
          muted={muted}
          onLanded={finish}
          playId={playId}
          result={result}
          skip={skipMotion}
        />
      </div>
    </section>
  )
}
