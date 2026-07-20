import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import {
  getAdsterraRewardedKey,
  getRewardedPointsAmount,
  isRewardedAdsConfigured,
} from '../lib/ads'
import {
  claimRewardedAdPoints,
  fetchRewardedAdClaimStatus,
} from '../lib/adsApi'
import { getTodayKey } from '../lib/daily'

declare global {
  interface Window {
    invokegpt?: (opts: Record<string, unknown>) => void
  }
}

const AD_REWARD_UNAVAILABLE =
  'Rewarded-ad points are temporarily unavailable until provider verification is enabled.'

/**
 * User-initiated once-daily rewarded video for shop points.
 * Requires sign-in; hidden when already claimed today.
 * Database awards stay disabled until provider verification exists.
 */
export function RewardedAdButton() {
  const { user, refreshAccount } = useAuth()
  const [claimed, setClaimed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rewardsDisabled, setRewardsDisabled] = useState(false)
  const points = getRewardedPointsAmount()

  useEffect(() => {
    if (!user || !isRewardedAdsConfigured()) return
    let cancelled = false
    void fetchRewardedAdClaimStatus(getTodayKey()).then((result) => {
      if (cancelled || !result.ok) return
      setClaimed(Boolean(result.claimed))
    })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!isRewardedAdsConfigured()) return null

  if (!user) {
    return (
      <p className="rewarded-ad-hint">
        Sign in to watch a short ad once a day for {points} points.
      </p>
    )
  }

  if (claimed) {
    return (
      <p className="rewarded-ad-hint" role="status">
        Daily rewarded ad claimed. Come back tomorrow.
      </p>
    )
  }

  if (rewardsDisabled) {
    return (
      <p className="rewarded-ad-hint" role="status">
        {AD_REWARD_UNAVAILABLE}
      </p>
    )
  }

  async function handleWatch() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    const key = getAdsterraRewardedKey()

    try {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-manhwadle-rewarded]')
        const run = () => {
          try {
            if (typeof window.invokegpt === 'function') {
              window.invokegpt({
                key,
                onComplete: () => resolve(),
                onError: () => reject(new Error('ad_error')),
              })
              return
            }
            reject(new Error('rewarded_unavailable'))
          } catch (err) {
            reject(err instanceof Error ? err : new Error('ad_error'))
          }
        }
        if (existing) {
          run()
          return
        }
        const script = document.createElement('script')
        script.async = true
        script.dataset.manhwadleRewarded = '1'
        script.src = `https://www.highperformanceformat.com/${key}/invoke.js`
        script.onload = () => run()
        script.onerror = () => reject(new Error('script_failed'))
        document.head.appendChild(script)
      })

      const result = await claimRewardedAdPoints(getTodayKey())
      if (!result.ok) {
        if (result.providerVerificationRequired || result.error === 'provider_verification_required') {
          setRewardsDisabled(true)
          setMessage(AD_REWARD_UNAVAILABLE)
          setBusy(false)
          return
        }
        setMessage(
          result.error === 'already_claimed'
            ? 'Already claimed today.'
            : 'Could not award points. Try again later.',
        )
        if (result.error === 'already_claimed') setClaimed(true)
        setBusy(false)
        return
      }
      setClaimed(true)
      setMessage(`+${result.pointsAwarded ?? points} points`)
      await refreshAccount()
    } catch {
      setMessage('Rewarded ad could not start. Try again later.')
    }
    setBusy(false)
  }

  return (
    <div className="rewarded-ad">
      <button
        type="button"
        className="btn btn-ghost rewarded-ad-btn"
        disabled={busy}
        onClick={() => void handleWatch()}
      >
        {busy ? 'Loading ad…' : `Watch ad for ${points} points`}
      </button>
      {message ? (
        <p className="rewarded-ad-hint" role="status">
          {message}
        </p>
      ) : null}
    </div>
  )
}
