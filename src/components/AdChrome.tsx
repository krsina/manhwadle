import { AdSlot } from './AdSlot'
import { RewardedAdButton } from './RewardedAdButton'
import { areAdsConfigured, isRewardedAdsConfigured } from '../lib/ads'

/**
 * Page-shell ad chrome: desktop L/R rails + bottom banner.
 * Rails hide below the desktop breakpoint via CSS.
 */
export function AdChrome() {
  const showDisplay = areAdsConfigured()
  const showRewarded = isRewardedAdsConfigured()

  if (!showDisplay && !showRewarded) return null

  return (
    <>
      {showDisplay ? (
        <>
          <div className="ad-rail ad-rail-left">
            <AdSlot slotId="rail_left" className="ad-slot-rail" />
          </div>
          <div className="ad-rail ad-rail-right">
            <AdSlot slotId="rail_right" className="ad-slot-rail" />
          </div>
        </>
      ) : null}
      <div className="ad-bottom-bar">
        {showDisplay ? (
          <AdSlot slotId="bottom" className="ad-slot-bottom" />
        ) : null}
        {showRewarded ? (
          <div className="ad-bottom-actions">
            <RewardedAdButton />
          </div>
        ) : null}
      </div>
    </>
  )
}
