import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearProductAnalyticsConsent,
  getMarketingAdsConsent,
  getProductAnalyticsConsent,
  getStoredProductAnalyticsConsent,
  hasGlobalPrivacyControl,
  isProductAnalyticsAllowed,
  setMarketingAdsConsent,
  setProductAnalyticsConsent,
  shouldShowProductConsentBanner,
} from './consent'

afterEach(() => {
  clearProductAnalyticsConsent()
  setMarketingAdsConsent(false)
  vi.unstubAllGlobals()
})

describe('consent + GPC', () => {
  it('defaults product analytics to unset / denied-until-granted', () => {
    expect(getStoredProductAnalyticsConsent()).toBe('unset')
    expect(getProductAnalyticsConsent({ globalPrivacyControl: false })).toBe('unset')
    expect(isProductAnalyticsAllowed({ globalPrivacyControl: false })).toBe(false)
    expect(shouldShowProductConsentBanner({ globalPrivacyControl: false })).toBe(true)
  })

  it('stores grant and deny decisions', () => {
    expect(setProductAnalyticsConsent(true, { globalPrivacyControl: false })).toBe(
      'granted',
    )
    expect(getProductAnalyticsConsent({ globalPrivacyControl: false })).toBe('granted')
    expect(isProductAnalyticsAllowed({ globalPrivacyControl: false })).toBe(true)
    expect(shouldShowProductConsentBanner({ globalPrivacyControl: false })).toBe(false)

    expect(setProductAnalyticsConsent(false, { globalPrivacyControl: false })).toBe(
      'denied',
    )
    expect(isProductAnalyticsAllowed({ globalPrivacyControl: false })).toBe(false)
  })

  it('treats Global Privacy Control as denial with no override', () => {
    expect(hasGlobalPrivacyControl({ globalPrivacyControl: true })).toBe(true)
    setProductAnalyticsConsent(true, { globalPrivacyControl: false })
    expect(getStoredProductAnalyticsConsent()).toBe('granted')
    expect(getProductAnalyticsConsent({ globalPrivacyControl: true })).toBe('denied')
    expect(isProductAnalyticsAllowed({ globalPrivacyControl: true })).toBe(false)
    expect(shouldShowProductConsentBanner({ globalPrivacyControl: true })).toBe(false)
    expect(setProductAnalyticsConsent(true, { globalPrivacyControl: true })).toBe(
      'denied',
    )
  })

  it('keeps marketing/ad consent separate and default-deny', () => {
    expect(getMarketingAdsConsent()).toBe('denied')
    setProductAnalyticsConsent(true, { globalPrivacyControl: false })
    expect(getMarketingAdsConsent()).toBe('denied')
    expect(setMarketingAdsConsent(true)).toBe('granted')
    expect(getMarketingAdsConsent()).toBe('granted')
    expect(getProductAnalyticsConsent({ globalPrivacyControl: false })).toBe('granted')
  })
})
