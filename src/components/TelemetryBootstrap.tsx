import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ConsentBanner } from './ConsentBanner'
import { ensureCloudflareWebAnalytics } from '../lib/cloudflareAnalytics'
import { syncTelemetryWithConsent, telemetry } from '../lib/telemetry'

/**
 * Boots cookieless Cloudflare analytics (when configured), syncs PostHog with
 * product consent, and emits sparse route_view events.
 */
export function TelemetryBootstrap() {
  const location = useLocation()

  useEffect(() => {
    ensureCloudflareWebAnalytics()
    syncTelemetryWithConsent()
  }, [])

  useEffect(() => {
    telemetry.routeView(location.pathname)
  }, [location.pathname])

  return <ConsentBanner />
}
