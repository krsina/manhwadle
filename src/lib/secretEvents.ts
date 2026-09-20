import { compareGuess, isCompleteMiss } from './compare'
import type { Manhwa } from './anilist-types'
import { isSupabaseConfigured, supabase } from './supabase'
import { notifyAchievementsChanged, unseeAchievementIds } from './achievementUnlocks'

export type SecretEvent =
  | 'konami'
  | 'tab_open_24h'
  | 'legal_visit'
  | 'shop_visit'
  | 'milestones_tourist'
  | 'hard_mode_on'
  | 'night_owl'
  | 'leaderboard_view'
  | 'reauth'
  | 'idle_home'
  | 'home_refresh'
  | 'dark_theme'
  | 'light_theme'
  | 'share_result'
  | 'wrong_genre'
  | 'speedrun'
  | 'tab_twin'
  | 'escape_modal'
  | 'account_menu_open'
  | 'mode_open'

const REAUTH_FLAG_KEY = 'manhwadle:secret:pending-reauth'
const TAB_CHANNEL = 'manhwadle:secret-tabs'
export const DIALOG_ESCAPE_EVENT = 'manhwadle:dialog-escape'

/** Background Cultivation: current page left idle this long. Reloads and navigation reset. */
export const BACKGROUND_CULTIVATION_MS = 2 * 60 * 60 * 1000

const claimedLocally = new Set<string>()

/** One-shot hush events → achievement id (used for client short-circuit). */
const ONE_SHOT_EVENT_ACHIEVEMENT: Partial<Record<SecretEvent, string>> = {
  konami: 'secret_konami',
  tab_open_24h: 'secret_background',
  legal_visit: 'secret_authors_note',
  shop_visit: 'secret_shopaholic',
  hard_mode_on: 'secret_hard_mode',
  night_owl: 'secret_night_owl',
  leaderboard_view: 'secret_lurker',
  reauth: 'secret_reauth',
  idle_home: 'secret_idle',
  dark_theme: 'secret_dark',
  light_theme: 'secret_lights',
  share_result: 'secret_share',
  wrong_genre: 'secret_wrong_genre',
  speedrun: 'secret_speedrun',
  tab_twin: 'secret_tab_twin',
  escape_modal: 'secret_escapist',
  account_menu_open: 'secret_account_menu',
  milestones_tourist: 'secret_tourist',
}

/** In-memory only: Ten Curtain Calls needs this many chip presses per tab session. */
export const ACCOUNT_MENU_SECRET_PRESSES = 10

let accountMenuPressCount = 0
let accountMenuClaimSent = false

/**
 * Advance the local account-chip press streak for this tab session.
 * Returns whether the client should fire the one-shot claim RPC.
 */
export function advanceAccountMenuPressCount(count: number): {
  count: number
  shouldClaim: boolean
} {
  const next = count + 1
  return {
    count: next,
    shouldClaim: next >= ACCOUNT_MENU_SECRET_PRESSES,
  }
}

function parseAwardedIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === 'string')
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseAwardedIds(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
  return []
}

/** Fire-and-forget secret progress. Safe to call when logged out / unconfigured. */
export async function reportSecretEvent(
  event: SecretEvent,
  payload: Record<string, unknown> = {},
): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return []

  // Client-side short-circuit for already-claimed one-shots in this tab session.
  // Server still enforces idempotency + rate limits; this just cuts needless RPCs.
  // Konami / account-menu stay callable so DEV "clear seen" can re-toast.
  const oneshotId = ONE_SHOT_EVENT_ACHIEVEMENT[event]
  if (
    oneshotId &&
    claimedLocally.has(oneshotId) &&
    event !== 'konami' &&
    event !== 'account_menu_open'
  ) {
    return []
  }

  try {
    const { data, error } = await supabase.rpc('report_secret_event', {
      p_event: event,
      p_payload: payload,
    })
    if (error) {
      if (import.meta.env.DEV) {
        console.warn('[secretEvents] report_secret_event failed', event, error.message)
      }
      return []
    }
    if (!data || typeof data !== 'object') return []
    const row = data as Record<string, unknown>
    if (row.ok !== true) {
      if (import.meta.env.DEV && row.error && row.error !== 'rate_limited') {
        console.warn('[secretEvents] report_secret_event rejected', event, row.error)
      }
      return []
    }
    const awarded = parseAwardedIds(row.awarded)
    // Real server grants should toast even if local "seen" was seeded from a
    // prior silent unlock (or a revoked+re-earned secret).
    if (awarded.length > 0) {
      unseeAchievementIds(awarded)
      for (const id of awarded) claimedLocally.add(id)
    } else if (oneshotId) {
      // Empty awarded after a successful one-shot call usually means already owned.
      claimedLocally.add(oneshotId)
    }
    // Konami / account-menu: nudge the unlock host even if the row already
    // existed (empty awarded) so DEV "clear seen" + re-trigger can toast again.
    let notifyIds = awarded
    if (event === 'konami' && !notifyIds.includes('secret_konami')) {
      notifyIds = [...notifyIds, 'secret_konami']
    }
    if (event === 'account_menu_open' && !notifyIds.includes('secret_account_menu')) {
      notifyIds = [...notifyIds, 'secret_account_menu']
    }
    if (notifyIds.length > 0) {
      notifyAchievementsChanged(notifyIds)
    }
    return awarded
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[secretEvents] report_secret_event threw', event, err)
    }
    return []
  }
}

/**
 * Account-chip presses for Ten Curtain Calls.
 * Counts in memory for this tab session only; claims once at 10 presses.
 * The server does not track press progress (one-shot award like other hush secrets).
 */
export function reportAccountMenuPress(): Promise<string[]> {
  if (accountMenuClaimSent) return Promise.resolve([])
  const step = advanceAccountMenuPressCount(accountMenuPressCount)
  accountMenuPressCount = step.count
  if (!step.shouldClaim) return Promise.resolve([])
  accountMenuClaimSent = true
  return reportSecretEvent('account_menu_open')
}

/** Reset in-tab press progress (DEV clear-seen, tests). */
export function resetAccountMenuPressSession() {
  accountMenuPressCount = 0
  accountMenuClaimSent = false
}

/** @deprecated Use resetAccountMenuPressSession */
export function resetAccountMenuPressCountForTests() {
  resetAccountMenuPressSession()
}

/** True only when the same signed-out user is signing back in. */
export function pendingReauthMatchesUser(
  stored: string | null,
  userId: string | null | undefined,
): boolean {
  if (!stored || !userId) return false
  // Legacy browser-wide flag awarded Return of the King to the next signup.
  if (stored === '1') return false
  return stored === userId
}

export function markPendingReauth(userId?: string | null) {
  if (!userId) return
  try {
    localStorage.setItem(REAUTH_FLAG_KEY, userId)
  } catch {
    // ignore
  }
}

export function consumePendingReauth(userId?: string | null): boolean {
  try {
    const stored = localStorage.getItem(REAUTH_FLAG_KEY)
    if (!pendingReauthMatchesUser(stored, userId)) {
      if (stored === '1') localStorage.removeItem(REAUTH_FLAG_KEY)
      return false
    }
    localStorage.removeItem(REAUTH_FLAG_KEY)
    return true
  } catch {
    return false
  }
}

/** Drop in-tab secret short-circuit when the signed-in user changes. */
export function resetSecretEventSession() {
  claimedLocally.clear()
  resetAccountMenuPressSession()
}

/** Konami: ↑↑↓↓←→←→BA (case-insensitive for B/A). */
export const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/** Advance Konami progress for one key. Pure helper for tests + listener. */
export function advanceKonamiSequence(
  index: number,
  key: string,
): { index: number; completed: boolean } {
  const normalized = key.length === 1 ? key.toLowerCase() : key
  const expected = KONAMI_SEQUENCE[index]
  if (!expected) return { index: 0, completed: false }

  if (normalized === expected) {
    const next = index + 1
    if (next >= KONAMI_SEQUENCE.length) return { index: 0, completed: true }
    return { index: next, completed: false }
  }

  return { index: normalized === KONAMI_SEQUENCE[0] ? 1 : 0, completed: false }
}

export function createKonamiListener(onComplete: () => void): () => void {
  let index = 0

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Listen site-wide, including while a guess/search field is focused,
    // so ↑↑↓↓←→←→BA works on play pages and not only the home lobby.
    const result = advanceKonamiSequence(index, event.key)
    index = result.index
    if (result.completed) onComplete()
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

const IDLE_MS = 10 * 60 * 1000
const LEGACY_HOME_OPEN_MS_KEY = 'manhwadle:secret:home-open-started-ms'

export function isBackgroundCultivationDue(startedMs: number, nowMs: number): boolean {
  return nowMs - startedMs >= BACKGROUND_CULTIVATION_MS
}

/** Idle timeout: activity, hiding the tab, or a new page starts the wait over. */
export function createIdleTracker(onComplete: () => void, idleMs: number): () => void {
  let timer: number | null = null

  function clear() {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function arm() {
    clear()
    if (document.visibilityState === 'hidden') return
    timer = window.setTimeout(() => onComplete(), idleMs)
  }

  function onActivity() {
    arm()
  }

  const opts: AddEventListenerOptions = { passive: true }
  window.addEventListener('pointerdown', onActivity, opts)
  window.addEventListener('keydown', onActivity, opts)
  window.addEventListener('mousemove', onActivity, opts)
  window.addEventListener('scroll', onActivity, opts)
  document.addEventListener('visibilitychange', onActivity)
  arm()

  return () => {
    clear()
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onActivity)
    window.removeEventListener('mousemove', onActivity)
    window.removeEventListener('scroll', onActivity)
    document.removeEventListener('visibilitychange', onActivity)
  }
}

/**
 * Background Cultivation: the current page must sit idle for 2 hours.
 * Reloads, route changes, and input all restart the wait.
 */
export function createBackgroundCultivationTracker(
  onComplete: () => void,
  userId?: string | null,
): () => void {
  try {
    localStorage.removeItem(LEGACY_HOME_OPEN_MS_KEY)
    if (userId) localStorage.removeItem(`${LEGACY_HOME_OPEN_MS_KEY}:${userId}`)
  } catch {
    // ignore leftover keys from the old dwell timer
  }
  return createIdleTracker(onComplete, BACKGROUND_CULTIVATION_MS)
}

export function createHomeIdleTracker(onComplete: () => void): () => void {
  return createIdleTracker(onComplete, IDLE_MS)
}

/** Detect a second Manhwadle tab via BroadcastChannel ping/pong. */
export function createTabTwinTracker(onComplete: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}

  const channel = new BroadcastChannel(TAB_CHANNEL)
  const selfId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  let done = false

  function finish() {
    if (done) return
    done = true
    onComplete()
  }

  channel.onmessage = (event) => {
    const data = event.data as { type?: string; id?: string } | null
    if (!data || data.id === selfId) return
    if (data.type === 'ping') {
      channel.postMessage({ type: 'pong', id: selfId })
    } else if (data.type === 'pong') {
      finish()
    }
  }

  channel.postMessage({ type: 'ping', id: selfId })
  const retry = window.setInterval(() => {
    if (done) return
    channel.postMessage({ type: 'ping', id: selfId })
  }, 4000)

  return () => {
    window.clearInterval(retry)
    channel.close()
  }
}

export function reportNightOwlIfLateLocalHour() {
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 5) {
    void reportSecretEvent('night_owl', { local_hour: hour })
  }
}

export function reportSpeedrunIfFast(startedAtMs: number | null | undefined) {
  if (startedAtMs == null) return
  const elapsed = Date.now() - startedAtMs
  if (elapsed >= 0 && elapsed <= 60_000) {
    void reportSecretEvent('speedrun', { elapsed_ms: elapsed })
  }
}

/** Wrong Genre: submitted guess with every feedback tile incorrect. */
export function reportWrongGenreIfCompleteMiss(guess: Manhwa, answer: Manhwa) {
  if (isCompleteMiss(compareGuess(guess, answer))) {
    void reportSecretEvent('wrong_genre')
  }
}

const ROUND_START_KEY = 'manhwadle:secret-round-start'

export function noteSecretRoundStart(mode: string, dateKey: string) {
  try {
    const key = `${ROUND_START_KEY}:${mode}:${dateKey}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, String(Date.now()))
    }
  } catch {
    // ignore
  }
}

export function readSecretRoundElapsedMs(mode: string, dateKey: string): number | null {
  try {
    const raw = sessionStorage.getItem(`${ROUND_START_KEY}:${mode}:${dateKey}`)
    const started = raw ? Number(raw) : NaN
    if (!Number.isFinite(started) || started <= 0) return null
    return Math.max(0, Date.now() - started)
  } catch {
    return null
  }
}
