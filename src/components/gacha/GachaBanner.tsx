import { PixelAvatar } from '../PixelAvatar'
import { GachaRevealStage } from './GachaRevealStage'
import { GACHA_STUDIO_COPY } from './gachaSkins'
import { GACHA_PULL_COST } from '../../lib/gachaWeekly'
import {
  GACHA_RATES,
  gachaPityCountdown,
  gachaPool,
  toGachaRarity,
  type GachaPityState,
  type GachaRollResult,
} from '../../lib/gacha'

const idleTiles = gachaPool().slice(0, 7)

export function GachaBanner({
  result,
  playId,
  pity,
  points,
  busy,
  skip,
  muted,
  notice,
  onPull,
  onComplete,
}: {
  result: GachaRollResult | null
  playId: number
  pity: GachaPityState
  points: number
  busy: boolean
  skip: boolean
  muted: boolean
  notice?: string | null
  onPull: () => void
  onComplete: () => void
}) {
  const { untilRarePlus, untilEpic } = gachaPityCountdown(pity)

  return (
    <section className="gacha-banner" aria-label="Featured banner">
      {result && playId > 0 ? (
        <GachaRevealStage
          muted={muted}
          onComplete={onComplete}
          playId={playId}
          result={result}
          skip={skip}
        />
      ) : (
        <section className="gacha-reveal gacha-reveal-empty">
          <div className="gacha-reveal-stage">
            <div className="gacha-carousel is-idle is-common">
              <span className="gacha-carousel-pointer is-top" aria-hidden="true" />
              <span className="gacha-carousel-pointer is-bottom" aria-hidden="true" />
              <div className="gacha-carousel-marker" aria-hidden="true" />
              <div className="gacha-carousel-viewport">
                <div className="gacha-carousel-track gacha-carousel-track-idle">
                  {idleTiles.map((character) => (
                    <div
                      className={`gacha-carousel-tile is-${toGachaRarity(character.rarity)}`}
                      key={character.id}
                    >
                      <PixelAvatar characterId={character.id} size="lg" decorative />
                      <span className="gacha-carousel-name">{character.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="gacha-banner-bar">
        <div className="gacha-banner-details" aria-live="polite">
          {result && !busy ? (
            <>
              <p className={`gacha-rarity-badge is-${result.rarity}`}>{result.rarity}</p>
              <div className="gacha-result-banner-copy">
                <h2>{result.character.name}</h2>
                <p className="gacha-result-copy">{result.character.description}</p>
              </div>
              <p className="gacha-result-flag">{result.isNew ? 'New' : 'Already owned'}</p>
            </>
          ) : (
            <p className="gacha-result-pending">
              {busy ? GACHA_STUDIO_COPY.spinning : GACHA_STUDIO_COPY.idle}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary gacha-pull-btn"
          disabled={points < GACHA_PULL_COST || busy}
          onClick={onPull}
        >
          {result ? GACHA_STUDIO_COPY.againCta : GACHA_STUDIO_COPY.cta}
        </button>
        <div className="gacha-banner-rates">
          <ul className="gacha-rate-chips" aria-label="Drop rates">
            {(
              [
                ['common', GACHA_RATES.common],
                ['rare', GACHA_RATES.rare],
                ['epic', GACHA_RATES.epic],
                ['legendary', GACHA_RATES.legendary],
              ] as const
            ).map(([rarity, rate]) => (
              <li key={rarity}>
                <span className={`gacha-rarity-badge is-${rarity}`}>{rarity}</span>
                <span className="gacha-rate-pct">{Math.round(rate * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="gacha-pity-readout" aria-label={`Pity: ${untilRarePlus} until rare or better, ${untilEpic} until epic`}>
            <span>{untilRarePlus} rare+</span>
            <span aria-hidden="true">·</span>
            <span>{untilEpic} epic</span>
          </p>
        </div>
      </div>
      {notice ? (
        <p className={`gacha-exchange-notice is-${result?.rarity ?? 'common'}`} role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
