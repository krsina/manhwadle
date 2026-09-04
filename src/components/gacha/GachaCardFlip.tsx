import { useEffect, useState } from 'react'
import { PixelAvatar } from '../PixelAvatar'
import type { GachaRollResult } from '../../lib/gacha'

export function GachaCardFlip({
  result,
  playId,
  skip,
}: {
  result: GachaRollResult
  playId: number
  skip: boolean
}) {
  const [flipped, setFlipped] = useState(skip)

  useEffect(() => {
    if (skip) {
      setFlipped(true)
      return
    }
    setFlipped(false)
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setFlipped(true))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [playId, skip])

  return (
    <div className={`gacha-card-stage is-${result.rarity}`}>
      <div className="gacha-card">
        <div className={`gacha-card-inner${flipped ? ' is-flipped' : ''}`}>
          <div className="gacha-card-face gacha-card-back" aria-hidden="true">
            <span className="gacha-card-back-mark">◆</span>
            <span className="gacha-card-back-label">Manhwadle</span>
          </div>
          <div className="gacha-card-face gacha-card-front">
            <PixelAvatar characterId={result.character.id} size="lg" decorative />
            <strong>{result.character.name}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
