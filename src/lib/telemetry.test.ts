import { afterEach, describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PROPERTY_FRAGMENTS,
  PERFORMANCE_SAMPLE_RATE,
  ROUND_COMPLETION_SAMPLE_RATE,
  __telemetryTestState,
  bucketDurationMs,
  bucketGuessCount,
  bucketHintCount,
  bucketProgress,
  captureTelemetry,
  consumeDedupeKey,
  normalizeRoute,
  resetTelemetryDedupeForTests,
  sanitizeTelemetryPayload,
  shouldSample,
} from './telemetry'
import { clearProductAnalyticsConsent, setProductAnalyticsConsent } from './consent'

afterEach(() => {
  resetTelemetryDedupeForTests()
  clearProductAnalyticsConsent()
})

describe('normalizeRoute', () => {
  it('maps known paths and strips query/hash noise via pathname only', () => {
    expect(normalizeRoute('/')).toBe('/')
    expect(normalizeRoute('/settings')).toBe('/settings')
    expect(normalizeRoute('/play/summary')).toBe('/play/summary')
    expect(normalizeRoute('/play/character/')).toBe('/play/character')
    expect(normalizeRoute('/play')).toBe('/play')
    expect(normalizeRoute('/play/unknown')).toBe('/other')
    expect(normalizeRoute('/admin')).toBe('/other')
  })

  it('never returns query strings or full URLs', () => {
    // Callers pass pathname only; defensive normalization still collapses junk.
    expect(normalizeRoute('/play/cover')).toBe('/play/cover')
    expect(normalizeRoute('https://evil.example/play/summary')).toBe('/other')
  })
})

describe('bucketization', () => {
  it('buckets guesses, hints, duration, and abandon progress', () => {
    expect(bucketGuessCount(0)).toBe('0')
    expect(bucketGuessCount(5)).toBe('5')
    expect(bucketGuessCount(6)).toBe('6_plus')
    expect(bucketGuessCount(99)).toBe('6_plus')

    expect(bucketHintCount(0)).toBe('0')
    expect(bucketHintCount(2)).toBe('2')
    expect(bucketHintCount(3)).toBe('3_plus')

    expect(bucketDurationMs(0)).toBe('under_30s')
    expect(bucketDurationMs(29_999)).toBe('under_30s')
    expect(bucketDurationMs(30_000)).toBe('30s_to_2m')
    expect(bucketDurationMs(120_000)).toBe('2m_to_10m')
    expect(bucketDurationMs(600_000)).toBe('over_10m')

    expect(bucketProgress(0)).toBe('guesses_0')
    expect(bucketProgress(2)).toBe('guesses_1_2')
    expect(bucketProgress(4)).toBe('guesses_3_4')
    expect(bucketProgress(5)).toBe('guesses_5_plus')
  })
})

describe('allowlist sanitation', () => {
  it('accepts a valid round_completed payload', () => {
    const cleaned = sanitizeTelemetryPayload('round_completed', {
      mode: 'summary',
      taste: 'action',
      outcome: 'won',
      surrendered: false,
      guess_bucket: '2',
      hint_bucket: '0',
      duration_bucket: 'under_30s',
      hard_mode: true,
    })
    expect(cleaned).toEqual({
      mode: 'summary',
      taste: 'action',
      outcome: 'won',
      surrendered: false,
      guess_bucket: '2',
      hint_bucket: '0',
      duration_bucket: 'under_30s',
      hard_mode: true,
    })
  })

  it('drops unknown keys, invalid enums, and incomplete payloads', () => {
    expect(
      sanitizeTelemetryPayload('taste_selected', {
        taste: 'action',
        email: 'a@b.c',
      } as never),
    ).toEqual({ taste: 'action' })

    expect(
      sanitizeTelemetryPayload('mode_selected', {
        mode: 'summary',
        entry_source: 'home',
        user_id: 'abc',
        title: 'Solo Leveling',
      } as never),
    ).toEqual({ mode: 'summary', entry_source: 'home' })

    expect(
      sanitizeTelemetryPayload('result_share', {
        success: true,
        method: 'clipboard',
        share_text: 'secret',
      } as never),
    ).toEqual({ success: true, method: 'clipboard' })

    expect(
      sanitizeTelemetryPayload('round_completed', {
        mode: 'summary',
        taste: 'action',
        outcome: 'won',
        surrendered: false,
        guess_bucket: '99' as never,
        hint_bucket: '0',
        duration_bucket: 'under_30s',
        hard_mode: false,
      }),
    ).toBeNull()

    expect(
      sanitizeTelemetryPayload('auth_complete', {
        provider_category: 'google' as never,
      }),
    ).toBeNull()
  })

  it('documents forbidden property fragments', () => {
    expect(FORBIDDEN_PROPERTY_FRAGMENTS).toEqual(
      expect.arrayContaining(['email', 'token', 'uuid', 'clipboard', 'url']),
    )
  })
})

describe('caps and dedupe', () => {
  it('dedupes keys once per session', () => {
    expect(consumeDedupeKey('a')).toBe(true)
    expect(consumeDedupeKey('a')).toBe(false)
    expect(consumeDedupeKey('b')).toBe(true)
  })

  it('samples completions at 100% and performance in the 5–10% band', () => {
    expect(ROUND_COMPLETION_SAMPLE_RATE).toBe(1)
    expect(PERFORMANCE_SAMPLE_RATE).toBeGreaterThanOrEqual(0.05)
    expect(PERFORMANCE_SAMPLE_RATE).toBeLessThanOrEqual(0.1)
    expect(shouldSample(1, () => 0.99)).toBe(true)
    expect(shouldSample(0.08, () => 0.09)).toBe(false)
    expect(shouldSample(0.08, () => 0.01)).toBe(true)
  })

  it('no-ops capture without consent or PostHog config', () => {
    setProductAnalyticsConsent(false, { globalPrivacyControl: false })
    const ok = captureTelemetry('taste_selected', { taste: 'both' })
    expect(ok).toBe(false)
    expect(__telemetryTestState().sessionEventCount).toBe(0)
  })
})
