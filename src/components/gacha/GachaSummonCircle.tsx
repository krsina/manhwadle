import { PixelAvatar } from '../PixelAvatar'
import type { GachaRollResult } from '../../lib/gacha'

export function GachaSummonCircle({
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
      className={`gacha-summon-stage is-${result.rarity}${skip ? ' is-skip' : ' is-playing'}`}
      data-play={playId}
    >
      <div className="gacha-summon-ring is-outer" aria-hidden="true" />
      <div className="gacha-summon-ring is-mid" aria-hidden="true" />
      <div className="gacha-summon-ring is-inner" aria-hidden="true" />
      <div className="gacha-summon-portal" aria-hidden="true" />
      <div className="gacha-summon-particles" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span className={`gacha-summon-spark is-${index}`} key={index} />
        ))}
      </div>
      <div className="gacha-summon-prize">
        <PixelAvatar characterId={result.character.id} size="xl" decorative snapCrisp />
      </div>
    </div>
  )
}
