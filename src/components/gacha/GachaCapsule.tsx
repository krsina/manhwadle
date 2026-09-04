import { PixelAvatar } from '../PixelAvatar'
import type { GachaRollResult } from '../../lib/gacha'

export function GachaCapsule({
  result,
  playId,
  skip,
}: {
  result: GachaRollResult
  playId: number
  skip: boolean
}) {
  return (
    <div
      className={`gacha-capsule-stage is-${result.rarity}${skip ? ' is-skip' : ' is-playing'}`}
      data-play={playId}
    >
      <div className="gacha-capsule" aria-hidden="true">
        <div className="gacha-capsule-half is-left" />
        <div className="gacha-capsule-half is-right" />
        <div className="gacha-capsule-shine" />
      </div>
      <div className="gacha-capsule-prize">
        <PixelAvatar characterId={result.character.id} size="lg" decorative />
      </div>
    </div>
  )
}
