/**
 * Product-analytics consent (PostHog). Marketing/ad consent is separate and
 * intentionally not granted by these APIs.
 *
 * Global Privacy Control (`navigator.globalPrivacyControl === true`) is treated
 * as denial. There is no override path.
 */

export type ConsentDecision = 'granted' | 'denied' | 'unset'

export type ConsentCategory = 'product_analytics' | 'marketing_ads'

const PRODUCT_KEY = 'manhwadle:consent:product_analytics'
const MARKETING_KEY = 'manhwadle:consent:marketing_ads'
const PRODUCT_VERSION = 1

/** In-memory fallback when localStorage is unavailable (tests / private mode). */
const memoryStore = new Map<string, string>()

export interface ProductConsentRecord {
  decision: Exclude<ConsentDecision, 'unset'>
  version: number
  updatedAt: string
}

function readStorage(key: string): string | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return raw
  } catch {
    /* private mode / non-DOM */
  }
  return memoryStore.get(key) ?? null
}

function writeStorage(key: string, value: string): void {
  memoryStore.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode / non-DOM */
  }
}

function removeStorage(key: string): void {
  memoryStore.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** True when the browser asserts Global Privacy Control. */
export function hasGlobalPrivacyControl(
  nav?: { globalPrivacyControl?: boolean } | null,
): boolean {
  const source =
    nav !== undefined
      ? nav
      : typeof navigator !== 'undefined'
        ? (navigator as { globalPrivacyControl?: boolean })
        : undefined
  return source?.globalPrivacyControl === true
}

function parseProductRecord(raw: string | null): ProductConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ProductConsentRecord>
    if (parsed.decision !== 'granted' && parsed.decision !== 'denied') return null
    if (parsed.version !== PRODUCT_VERSION) return null
    if (typeof parsed.updatedAt !== 'string') return null
    return {
      decision: parsed.decision,
      version: PRODUCT_VERSION,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    if (raw === 'granted' || raw === 'denied') {
      return {
        decision: raw,
        version: PRODUCT_VERSION,
        updatedAt: new Date(0).toISOString(),
      }
    }
    return null
  }
}

/** Stored product decision only (ignores GPC). */
export function getStoredProductAnalyticsConsent(): ConsentDecision {
  const record = parseProductRecord(readStorage(PRODUCT_KEY))
  return record?.decision ?? 'unset'
}

/**
 * Effective product-analytics decision.
 * GPC forces denied regardless of stored preference.
 */
export function getProductAnalyticsConsent(
  nav?: { globalPrivacyControl?: boolean } | null,
): ConsentDecision {
  if (hasGlobalPrivacyControl(nav)) return 'denied'
  return getStoredProductAnalyticsConsent()
}

export function isProductAnalyticsAllowed(
  nav?: { globalPrivacyControl?: boolean } | null,
): boolean {
  return getProductAnalyticsConsent(nav) === 'granted'
}

/** Show the banner when the user has not chosen and GPC is not asserting denial. */
export function shouldShowProductConsentBanner(
  nav?: { globalPrivacyControl?: boolean } | null,
): boolean {
  if (hasGlobalPrivacyControl(nav)) return false
  return getStoredProductAnalyticsConsent() === 'unset'
}

export function setProductAnalyticsConsent(
  granted: boolean,
  nav?: { globalPrivacyControl?: boolean } | null,
): ConsentDecision {
  if (hasGlobalPrivacyControl(nav)) {
    const denied: ProductConsentRecord = {
      decision: 'denied',
      version: PRODUCT_VERSION,
      updatedAt: new Date().toISOString(),
    }
    writeStorage(PRODUCT_KEY, JSON.stringify(denied))
    return 'denied'
  }
  const record: ProductConsentRecord = {
    decision: granted ? 'granted' : 'denied',
    version: PRODUCT_VERSION,
    updatedAt: new Date().toISOString(),
  }
  writeStorage(PRODUCT_KEY, JSON.stringify(record))
  return record.decision
}

export function clearProductAnalyticsConsent(): void {
  removeStorage(PRODUCT_KEY)
}

/**
 * Marketing / advertising consent — separate from product analytics.
 * Defaults to denied; granting is not offered in the current UI.
 */
export function getMarketingAdsConsent(): ConsentDecision {
  const raw = readStorage(MARKETING_KEY)
  if (raw === 'granted') return 'granted'
  if (raw === 'denied') return 'denied'
  return 'denied'
}

export function setMarketingAdsConsent(granted: boolean): ConsentDecision {
  const decision: Exclude<ConsentDecision, 'unset'> = granted ? 'granted' : 'denied'
  writeStorage(MARKETING_KEY, decision)
  return decision
}

export function consentCategoryLabel(category: ConsentCategory): string {
  return category === 'product_analytics' ? 'Product analytics' : 'Marketing & ads'
}
