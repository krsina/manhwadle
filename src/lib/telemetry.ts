/**
 * Allowlisted product telemetry. Events are compile-time constrained and
 * runtime-sanitized. Never send PII, content, or free-form state to PostHog.
 *
 * No-op when PostHog env is missing or product consent is not granted.
 * posthog-js is loaded only via dynamic import after consent + config.
 */

import {
  getProductAnalyticsConsent,
  isProductAnalyticsAllowed,
  type ConsentDecision,
} from './consent'

export type TelemetryMode = 'summary' | 'character' | 'cover' | 'heardle'

export type ModeEntrySource =
  | 'home'
  | 'switcher'
  | 'direct'
  | 'legacy'
  | 'settings'
  | 'unknown'

export type AuthProviderCategory = 'email' | 'oauth' | 'unknown'

export type ShareMethod = 'clipboard' | 'share' | 'unknown'

export type GuessCountBucket = '0' | '1' | '2' | '3' | '4' | '5' | '6_plus'

export type HintCountBucket = '0' | '1' | '2' | '3_plus'

export type DurationBucket = 'under_30s' | '30s_to_2m' | '2m_to_10m' | 'over_10m'

export type ProgressBucket =
  | 'guesses_0'
  | 'guesses_1_2'
  | 'guesses_3_4'
  | 'guesses_5_plus'

export type NormalizedRoute =
  | '/'
  | '/settings'
  | '/play/summary'
  | '/play/character'
  | '/play/cover'
  | '/play/heardle'
  | '/play'
  | '/other'

export type AdSlotId = 'home_footer' | 'result_modal' | 'play_sidebar'

/** Compile-time event → property contract. */
export type TelemetryEventMap = {
  taste_selected: { taste: 'action' | 'romance' | 'both' }
  mode_selected: { mode: TelemetryMode; entry_source: ModeEntrySource }
  route_view: { route: NormalizedRoute }
  round_started: {
    mode: TelemetryMode
    taste: 'action' | 'romance' | 'both'
    hard_mode: boolean
  }
  abandonment_checkpoint: {
    mode: TelemetryMode
    taste: 'action' | 'romance' | 'both'
    progress_bucket: ProgressBucket
  }
  round_completed: {
    mode: TelemetryMode
    taste: 'action' | 'romance' | 'both'
    outcome: 'won' | 'lost'
    surrendered: boolean
    guess_bucket: GuessCountBucket
    hint_bucket: HintCountBucket
    duration_bucket: DurationBucket
    hard_mode: boolean
  }
  bonus_result: {
    mode: TelemetryMode
    correct: boolean
  }
  result_share: {
    success: boolean
    method: ShareMethod
  }
  auth_prompt: { provider_category: AuthProviderCategory }
  auth_start: { provider_category: AuthProviderCategory }
  auth_complete: { provider_category: AuthProviderCategory }
  next_round_started: {
    mode: TelemetryMode
    taste: 'action' | 'romance' | 'both'
  }
  /** Schema reserved for future ad inventory; not emitted until ads ship. */
  ad_slot_viewable: { slot_id: AdSlotId }
  /** Optional sampled performance signal (5–10%). */
  performance_sample: { kind: 'cwv_proxy' }
}

export type TelemetryEventName = keyof TelemetryEventMap

const EVENT_NAMES = new Set<string>([
  'taste_selected',
  'mode_selected',
  'route_view',
  'round_started',
  'abandonment_checkpoint',
  'round_completed',
  'bonus_result',
  'result_share',
  'auth_prompt',
  'auth_start',
  'auth_complete',
  'next_round_started',
  'ad_slot_viewable',
  'performance_sample',
])

const ALLOWED_KEYS_BY_EVENT: { [K in TelemetryEventName]: ReadonlySet<string> } = {
  taste_selected: new Set(['taste']),
  mode_selected: new Set(['mode', 'entry_source']),
  route_view: new Set(['route']),
  round_started: new Set(['mode', 'taste', 'hard_mode']),
  abandonment_checkpoint: new Set(['mode', 'taste', 'progress_bucket']),
  round_completed: new Set([
    'mode',
    'taste',
    'outcome',
    'surrendered',
    'guess_bucket',
    'hint_bucket',
    'duration_bucket',
    'hard_mode',
  ]),
  bonus_result: new Set(['mode', 'correct']),
  result_share: new Set(['success', 'method']),
  auth_prompt: new Set(['provider_category']),
  auth_start: new Set(['provider_category']),
  auth_complete: new Set(['provider_category']),
  next_round_started: new Set(['mode', 'taste']),
  ad_slot_viewable: new Set(['slot_id']),
  performance_sample: new Set(['kind']),
}

const ENUMS = {
  taste: new Set(['action', 'romance', 'both']),
  mode: new Set(['summary', 'character', 'cover', 'heardle']),
  entry_source: new Set(['home', 'switcher', 'direct', 'legacy', 'settings', 'unknown']),
  progress_bucket: new Set([
    'guesses_0',
    'guesses_1_2',
    'guesses_3_4',
    'guesses_5_plus',
  ]),
  outcome: new Set(['won', 'lost']),
  guess_bucket: new Set(['0', '1', '2', '3', '4', '5', '6_plus']),
  hint_bucket: new Set(['0', '1', '2', '3_plus']),
  duration_bucket: new Set(['under_30s', '30s_to_2m', '2m_to_10m', 'over_10m']),
  method: new Set(['clipboard', 'share', 'unknown']),
  provider_category: new Set(['email', 'oauth', 'unknown']),
  slot_id: new Set(['home_footer', 'result_modal', 'play_sidebar']),
  kind: new Set(['cwv_proxy']),
  route: new Set([
    '/',
    '/settings',
    '/play/summary',
    '/play/character',
    '/play/cover',
    '/play/heardle',
    '/play',
    '/other',
  ]),
} as const

/** Properties that must never leave the client via product analytics. */
export const FORBIDDEN_PROPERTY_FRAGMENTS = [
  'email',
  'token',
  'password',
  'uuid',
  'user_id',
  'userid',
  'oauth',
  'guess',
  'search',
  'title',
  'character',
  'name',
  'clipboard',
  'share_text',
  'sharetext',
  'location',
  'lat',
  'lon',
  'fingerprint',
  'url',
  'href',
  'query',
  'pathname',
  'referrer',
  'distinct_id',
] as const

const SESSION_EVENT_CAP = 120
const PER_EVENT_CAPS: Partial<Record<TelemetryEventName, number>> = {
  route_view: 40,
  abandonment_checkpoint: 20,
  performance_sample: 4,
  mode_selected: 30,
  round_started: 20,
  round_completed: 20,
}

/** Round completions keep 100% initially. */
export const ROUND_COMPLETION_SAMPLE_RATE = 1
/** Performance samples: 5–10% band (use 8%). */
export const PERFORMANCE_SAMPLE_RATE = 0.08

const EU_HOST = 'https://eu.i.posthog.com'

let initialized = false
let sessionEventCount = 0
const perEventCounts = new Map<string, number>()
const dedupeKeys = new Set<string>()
const dedupeRecent = new Map<string, number>()
let pendingAuthCategory: AuthProviderCategory = 'unknown'

function getEnv(name: string): string {
  try {
    const value = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[name]
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

export function getPostHogConfig(): { key: string; host: string } | null {
  const key = getEnv('VITE_POSTHOG_KEY')
  if (!key) return null
  const host = getEnv('VITE_POSTHOG_HOST') || EU_HOST
  return { key, host }
}

export function isPostHogConfigured(): boolean {
  return getPostHogConfig() != null
}

export function bucketGuessCount(count: number): GuessCountBucket {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
  if (n >= 6) return '6_plus'
  return String(n) as GuessCountBucket
}

export function bucketHintCount(count: number): HintCountBucket {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
  if (n >= 3) return '3_plus'
  return String(n) as HintCountBucket
}

export function bucketDurationMs(ms: number): DurationBucket {
  const n = Math.max(0, Number.isFinite(ms) ? ms : 0)
  if (n < 30_000) return 'under_30s'
  if (n < 120_000) return '30s_to_2m'
  if (n < 600_000) return '2m_to_10m'
  return 'over_10m'
}

export function bucketProgress(guessCount: number): ProgressBucket {
  const n = Math.max(0, Math.floor(Number.isFinite(guessCount) ? guessCount : 0))
  if (n <= 0) return 'guesses_0'
  if (n <= 2) return 'guesses_1_2'
  if (n <= 4) return 'guesses_3_4'
  return 'guesses_5_plus'
}

/**
 * Strip query/hash and map to a small allowlisted route set.
 * Never returns raw URLs or query strings.
 */
export function normalizeRoute(pathname: string): NormalizedRoute {
  const path = (pathname.split('?')[0] ?? '/').split('#')[0] || '/'
  const cleaned = path.replace(/\/+$/, '') || '/'
  if (cleaned === '/') return '/'
  if (cleaned === '/settings') return '/settings'
  if (cleaned === '/play') return '/play'
  const play = cleaned.match(/^\/play\/(summary|character|cover|heardle)$/)
  if (play?.[1]) return `/play/${play[1]}` as NormalizedRoute
  return '/other'
}

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase()
  return FORBIDDEN_PROPERTY_FRAGMENTS.some(
    (frag) => lower === frag || lower.includes(frag),
  )
}

export function __isForbiddenTelemetryKeyForTests(key: string): boolean {
  return isForbiddenKey(key)
}

function sanitizeValue(
  key: string,
  value: unknown,
): string | boolean | number | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Only allow boolean-like flags we already typed; reject free numbers.
    return null
  }
  if (typeof value !== 'string') return null
  if (value.length > 32) return null
  if (/[/?#&=@]|https?:/i.test(value)) return null

  const allowed = (ENUMS as Record<string, ReadonlySet<string>>)[key]
  if (allowed) return allowed.has(value) ? value : null

  // Booleans already handled; unknown string keys rejected.
  return null
}

/**
 * Runtime allowlist: drop unknown events/keys and forbidden fragments.
 * Returns null when the event must not be sent.
 */
export function sanitizeTelemetryPayload<E extends TelemetryEventName>(
  event: E,
  props: TelemetryEventMap[E],
): Record<string, string | boolean> | null {
  if (!EVENT_NAMES.has(event)) return null
  const allowedKeys = ALLOWED_KEYS_BY_EVENT[event]
  const out: Record<string, string | boolean> = {}

  for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) {
      // Defense in depth: reject anything that looks like forbidden PII keys.
      if (isForbiddenKey(key)) continue
      continue
    }
    const cleaned = sanitizeValue(key, raw)
    if (cleaned === null) continue
    if (typeof cleaned === 'number') continue
    out[key] = cleaned
  }

  // Require every declared key to survive sanitization.
  for (const key of allowedKeys) {
    if (!(key in out)) return null
  }
  return out
}

export function shouldSample(rate: number, random = Math.random): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  return random() < rate
}

function underCap(event: TelemetryEventName): boolean {
  if (sessionEventCount >= SESSION_EVENT_CAP) return false
  const cap = PER_EVENT_CAPS[event]
  if (cap == null) return true
  return (perEventCounts.get(event) ?? 0) < cap
}

function noteEmit(event: TelemetryEventName): void {
  sessionEventCount += 1
  perEventCounts.set(event, (perEventCounts.get(event) ?? 0) + 1)
}

/** Deduplicate identical milestone keys (StrictMode-safe). Optional TTL allows re-fire later. */
export function consumeDedupeKey(key: string, ttlMs = 0): boolean {
  if (ttlMs > 0) {
    const now = Date.now()
    const prev = dedupeRecent.get(key)
    if (prev != null && now - prev < ttlMs) return false
    dedupeRecent.set(key, now)
    return true
  }
  if (dedupeKeys.has(key)) return false
  dedupeKeys.add(key)
  return true
}

export function resetTelemetryDedupeForTests(): void {
  dedupeKeys.clear()
  dedupeRecent.clear()
  sessionEventCount = 0
  perEventCounts.clear()
}

let pendingModeEntrySource: ModeEntrySource | null = null

/** Set before navigating to a play route so mode_selected gets the right source. */
export function noteModeEntrySource(source: ModeEntrySource): void {
  pendingModeEntrySource = source
}

export function peekModeEntrySource(
  fallback: ModeEntrySource = 'direct',
): ModeEntrySource {
  return pendingModeEntrySource ?? fallback
}

/** Clear after the play route has read the source (delayed for StrictMode). */
export function clearModeEntrySource(): void {
  pendingModeEntrySource = null
}

export function setPendingAuthProviderCategory(category: AuthProviderCategory): void {
  pendingAuthCategory = category
}

export function getPendingAuthProviderCategory(): AuthProviderCategory {
  return pendingAuthCategory
}

type PostHogClient = {
  init: (key: string, options: Record<string, unknown>) => void
  capture: (event: string, properties?: Record<string, unknown>) => void
  opt_in_capturing: () => void
  opt_out_capturing: () => void
  reset: () => void
  register?: (properties: Record<string, unknown>) => void
}

let posthogClient: PostHogClient | null = null
let posthogLoadPromise: Promise<PostHogClient | null> | null = null

async function loadPostHog(): Promise<PostHogClient | null> {
  if (posthogClient) return posthogClient
  if (!getPostHogConfig()) return null
  if (!posthogLoadPromise) {
    posthogLoadPromise = import('posthog-js')
      .then((mod) => {
        const client = (mod.default ?? mod) as PostHogClient
        posthogClient = client
        return client
      })
      .catch(() => null)
  }
  return posthogLoadPromise
}

function client(): PostHogClient | null {
  if (!initialized) return null
  return posthogClient
}

/**
 * Initialize PostHog EU only when configured and product consent is granted.
 * Explicit capture only — no replay, autocapture, pageviews, surveys, or heatmaps.
 * Uses dynamic import so denied/unconfigured paths never pay the static bundle cost.
 */
export function syncTelemetryWithConsent(
  nav?: { globalPrivacyControl?: boolean } | null,
): ConsentDecision {
  const decision = getProductAnalyticsConsent(nav)
  const config = getPostHogConfig()

  if (!config || decision !== 'granted') {
    shutdownProductTelemetry()
    return decision
  }

  void loadPostHog().then((ph) => {
    if (!ph) return
    if (!isProductAnalyticsAllowed(nav)) {
      shutdownProductTelemetry()
      return
    }
    if (!initialized) {
      ph.init(config.key, {
        api_host: config.host,
        ui_host: 'https://eu.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        disable_session_recording: true,
        rageclick: false,
        opt_out_capturing_by_default: false,
        persistence: 'localStorage+cookie',
        person_profiles: 'never',
        property_denylist: [
          '$ip',
          '$email',
          '$user_id',
          '$pathname',
          '$current_url',
          '$referrer',
          '$referring_domain',
          '$raw_user_agent',
        ],
        before_send: (event: { event?: string } | null) => {
          if (!event) return null
          if (event.event?.startsWith('$')) return null
          if (event.event && !EVENT_NAMES.has(event.event)) return null
          return event
        },
        loaded: (instance: PostHogClient) => {
          instance.register?.({
            app: 'manhwadle',
            telemetry_tier: 'product_sparse',
          })
        },
      })
      initialized = true
    } else {
      ph.opt_in_capturing()
    }
  })

  return decision
}

/** Opt out / reset PostHog and clear in-memory session counters' capture path. */
export function shutdownProductTelemetry(): void {
  if (!initialized && !posthogClient) return
  try {
    posthogClient?.opt_out_capturing()
    posthogClient?.reset()
  } catch {
    /* ignore */
  }
  initialized = false
}

export function captureTelemetry<E extends TelemetryEventName>(
  event: E,
  props: TelemetryEventMap[E],
  options?: { dedupeKey?: string; dedupeTtlMs?: number; sampleRate?: number },
): boolean {
  try {
    if (!isProductAnalyticsAllowed()) return false
    if (!getPostHogConfig()) return false
    if (!initialized) {
      syncTelemetryWithConsent()
    }
    if (!initialized) return false
    if (!underCap(event)) return false

    const rate =
      options?.sampleRate ??
      (event === 'round_completed'
        ? ROUND_COMPLETION_SAMPLE_RATE
        : event === 'performance_sample'
          ? PERFORMANCE_SAMPLE_RATE
          : 1)
    if (!shouldSample(rate)) return false

    if (
      options?.dedupeKey &&
      !consumeDedupeKey(options.dedupeKey, options.dedupeTtlMs ?? 0)
    ) {
      return false
    }

    const sanitized = sanitizeTelemetryPayload(event, props)
    if (!sanitized) return false

    const ph = client()
    if (!ph) return false
    ph.capture(event, sanitized)
    noteEmit(event)
    return true
  } catch {
    // Telemetry must never block gameplay.
    return false
  }
}

/** Typed helpers used by UI / games. */
export const telemetry = {
  tasteSelected(taste: 'action' | 'romance' | 'both') {
    return captureTelemetry('taste_selected', { taste })
  },
  modeSelected(
    mode: TelemetryMode,
    entry_source: ModeEntrySource,
    dedupeKey?: string,
  ) {
    return captureTelemetry(
      'mode_selected',
      { mode, entry_source },
      dedupeKey ? { dedupeKey, dedupeTtlMs: 100 } : undefined,
    )
  },
  routeView(pathname: string) {
    const route = normalizeRoute(pathname)
    return captureTelemetry('route_view', { route }, {
      dedupeKey: `route:${route}`,
      dedupeTtlMs: 500,
    })
  },
  roundStarted(input: TelemetryEventMap['round_started'] & { dedupeKey: string }) {
    const { dedupeKey, ...props } = input
    return captureTelemetry('round_started', props, { dedupeKey })
  },
  abandonment(input: TelemetryEventMap['abandonment_checkpoint'] & { dedupeKey: string }) {
    const { dedupeKey, ...props } = input
    return captureTelemetry('abandonment_checkpoint', props, { dedupeKey })
  },
  roundCompleted(props: TelemetryEventMap['round_completed']) {
    return captureTelemetry('round_completed', props, {
      sampleRate: ROUND_COMPLETION_SAMPLE_RATE,
    })
  },
  bonusResult(mode: TelemetryMode, correct: boolean) {
    return captureTelemetry('bonus_result', { mode, correct })
  },
  resultShare(success: boolean, method: ShareMethod) {
    return captureTelemetry('result_share', { success, method })
  },
  authPrompt(provider_category: AuthProviderCategory = 'unknown') {
    return captureTelemetry('auth_prompt', { provider_category })
  },
  authStart(provider_category: AuthProviderCategory) {
    setPendingAuthProviderCategory(provider_category)
    return captureTelemetry('auth_start', { provider_category })
  },
  authComplete(provider_category?: AuthProviderCategory) {
    const category = provider_category ?? getPendingAuthProviderCategory()
    return captureTelemetry(
      'auth_complete',
      { provider_category: category },
      { dedupeKey: `auth_complete:${category}` },
    )
  },
  nextRound(mode: TelemetryMode, taste: 'action' | 'romance' | 'both') {
    return captureTelemetry('next_round_started', { mode, taste })
  },
  /** Reserved; safe no-op schema for future ads. */
  adSlotViewable(slot_id: AdSlotId) {
    return captureTelemetry('ad_slot_viewable', { slot_id })
  },
  performanceSample() {
    return captureTelemetry(
      'performance_sample',
      { kind: 'cwv_proxy' },
      { sampleRate: PERFORMANCE_SAMPLE_RATE },
    )
  },
}

export function __telemetryTestState() {
  return {
    initialized,
    sessionEventCount,
    perEventCounts: new Map(perEventCounts),
    dedupeSize: dedupeKeys.size,
  }
}
