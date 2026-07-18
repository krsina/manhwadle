import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  setProductAnalyticsConsent,
  shouldShowProductConsentBanner,
} from '../lib/consent'
import { PRIVACY_PATH, SETTINGS_PATH } from '../lib/routes'
import { syncTelemetryWithConsent } from '../lib/telemetry'

interface ConsentBannerProps {
  onDecision?: (granted: boolean) => void
}

/**
 * Accessible product-analytics consent prompt.
 * Hidden when GPC is on or a decision is already stored.
 * Marketing/ad consent is intentionally not requested here.
 */
export function ConsentBanner({ onDecision }: ConsentBannerProps) {
  const titleId = useId()
  const descId = useId()
  const [visible, setVisible] = useState(() => shouldShowProductConsentBanner())

  useEffect(() => {
    setVisible(shouldShowProductConsentBanner())
  }, [])

  if (!visible) return null

  function decide(granted: boolean) {
    setProductAnalyticsConsent(granted)
    syncTelemetryWithConsent()
    setVisible(false)
    onDecision?.(granted)
  }

  return (
    <div
      className="consent-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="consent-banner-copy">
        <h2 id={titleId} className="consent-banner-title">
          Optional product analytics
        </h2>
        <p id={descId} className="consent-banner-body">
          We use sparse, allowlisted events (for example, which mode you play and
          whether a round finished) to improve Manhwadle. No emails, guesses, titles,
          or account ids. Cookieless Cloudflare traffic metrics load separately when
          configured. You can change this anytime in{' '}
          <Link to={SETTINGS_PATH}>Account settings</Link>. See also the{' '}
          <Link to={PRIVACY_PATH}>Privacy</Link> page. Marketing and ad consent is
          separate and not enabled.
        </p>
      </div>
      <div className="consent-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={() => decide(false)}>
          No thanks
        </button>
        <button type="button" className="btn btn-primary" onClick={() => decide(true)}>
          Allow analytics
        </button>
      </div>
    </div>
  )
}
