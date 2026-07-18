/**
 * Cloudflare Web Analytics — cookieless essential traffic / Core Web Vitals tier.
 * Loaded only when `VITE_CF_WEB_ANALYTICS_TOKEN` is present. Token is a public
 * site beacon id, not a secret; still never hardcode it in source.
 */

const SCRIPT_ID = 'cf-web-analytics-beacon'
const SCRIPT_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

function getToken(): string {
  try {
    const value = import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

export function isCloudflareAnalyticsConfigured(): boolean {
  return getToken().length > 0
}

/**
 * Dynamically inject the Cloudflare Web Analytics beacon once.
 * Safe to call repeatedly. No-op when the token env is missing.
 */
export function ensureCloudflareWebAnalytics(): boolean {
  if (typeof document === 'undefined') return false
  const token = getToken()
  if (!token) return false
  if (document.getElementById(SCRIPT_ID)) return true

  try {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.defer = true
    script.src = SCRIPT_SRC
    script.setAttribute(
      'data-cf-beacon',
      JSON.stringify({ token, spa: true }),
    )
    document.head.appendChild(script)
    return true
  } catch {
    return false
  }
}
