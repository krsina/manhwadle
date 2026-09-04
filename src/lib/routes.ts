import { getMode, resolveActiveMode } from '../modes'
import { parseDateKey } from './archive'

export const HOME_PATH = '/'
export const SETTINGS_PATH = '/settings'
export const MILESTONES_PATH = '/milestones'
export const SHOP_PATH = '/shop'
export const SHOP_COLLECTION_PATH = '/shop/collection'

export type LookTab = 'characters' | 'backgrounds'

/** Shop or wardrobe URL, optionally opening the character or background tab. */
export function shopLookPath(options: {
  collection?: boolean
  tab?: LookTab
} = {}): string {
  const base = options.collection ? SHOP_COLLECTION_PATH : SHOP_PATH
  if (options.tab === 'backgrounds') return `${base}?tab=backgrounds`
  if (options.tab === 'characters') return `${base}?tab=characters`
  return base
}

export function parseLookTab(value: string | null | undefined): LookTab {
  return value === 'backgrounds' ? 'backgrounds' : 'characters'
}
export const LEADERBOARD_PATH = '/leaderboard'
export const DEV_AVATAR_BUST_CROPS_PATH = '/dev/avatar-bust-crops'
export const DEV_VERSUS_EFFECTS_PATH = '/dev/versus-effects'
export const DEV_GACHA_SHOP_PATH = '/dev/gacha-shop'
export const DEV_NEW_AVATARS_PATH = '/dev/new-avatars'
export const PRIVACY_PATH = '/privacy'
export const TERMS_PATH = '/terms'
export const ATTRIBUTION_PATH = '/attribution'
export const MODERATION_POLICY_PATH = '/moderation'
export const ABOUT_PATH = '/about'
export const HOW_IT_WORKS_PATH = '/how-it-works'
export const NEWS_PATH = '/news'
/** Legacy path retained for compatibility redirects. */
export const UPDATES_PATH = '/updates'
export const DATABASE_PATH = '/database'
export const STAFF_PATH = '/staff'
export const STAFF_ANALYTICS_PATH = '/staff/analytics'
export const STAFF_MODERATION_PATH = '/staff/moderation'
export const STAFF_COMMENTS_PATH = '/staff/comments'
export const PLAY_PATH_PREFIX = '/play'
export const VERSUS_PATH = '/versus'

export function newsPath(slug?: string | null): string {
  if (!slug) return NEWS_PATH
  return `${NEWS_PATH}/${encodeURIComponent(slug)}`
}

export function updatesPath(slug?: string | null): string {
  if (!slug) return UPDATES_PATH
  return `${UPDATES_PATH}/${encodeURIComponent(slug)}`
}

export function versusRoomPath(roomId?: string | null): string {
  if (!roomId) return VERSUS_PATH
  return `${VERSUS_PATH}/${encodeURIComponent(roomId)}`
}

const MODE_IDS = new Set(['summary', 'character', 'cover', 'heardle'])

export const LEGAL_PATHS = [
  ABOUT_PATH,
  HOW_IT_WORKS_PATH,
  PRIVACY_PATH,
  TERMS_PATH,
  ATTRIBUTION_PATH,
  MODERATION_POLICY_PATH,
] as const

/** Canonical play path for a mode id. */
export function playPath(modeId: string, dateKey?: string | null): string {
  const mode = resolveActiveMode(modeId).id
  const base = `${PLAY_PATH_PREFIX}/${mode}`
  if (!dateKey) return base
  const parsed = parseDateKey(dateKey)
  return parsed ? `${base}?date=${parsed}` : base
}

export function settingsPath(): string {
  return SETTINGS_PATH
}

/** Parse `/play/:mode` segment; null when missing/unknown. */
export function parsePlayModeParam(modeParam: string | undefined | null): string | null {
  if (!modeParam) return null
  const id = modeParam.trim().toLowerCase()
  if (!MODE_IDS.has(id) || !getMode(id)) return null
  return id
}

/**
 * Legacy entry: `?mode=` query or `#hash` on `/` (and bare `/play`).
 * Returns a destination path or null when no redirect is needed.
 */
export function legacyPlayRedirectTarget(input: {
  pathname: string
  search: string
  hash: string
}): string | null {
  const { pathname, search, hash } = input
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const date = parseDateKey(params.get('date'))
  const dateSuffix = date ? `?date=${date}` : ''

  const fromQuery = params.get('mode')
  const fromHash = hash.replace(/^#/, '').trim()
  const candidate = (fromQuery || fromHash || '').trim().toLowerCase()

  if (pathname === '/' || pathname === '') {
    if (candidate && MODE_IDS.has(candidate) && getMode(candidate)) {
      return playPath(candidate, date)
    }
    return null
  }

  if (pathname === PLAY_PATH_PREFIX || pathname === `${PLAY_PATH_PREFIX}/`) {
    const mode = candidate && MODE_IDS.has(candidate) ? candidate : resolveActiveMode().id
    return playPath(mode, date)
  }

  // `/play/:mode?mode=` — strip legacy query mode, keep date.
  const playMatch = pathname.match(/^\/play\/([^/]+)\/?$/)
  if (playMatch) {
    const pathMode = parsePlayModeParam(playMatch[1])
    if (!pathMode) return playPath(resolveActiveMode().id, date)
    if (fromQuery || fromHash) {
      // Clean URL: path mode wins; drop mode/hash noise.
      const clean = new URLSearchParams()
      if (date) clean.set('date', date)
      const qs = clean.toString()
      return qs ? `${PLAY_PATH_PREFIX}/${pathMode}?${qs}` : `${PLAY_PATH_PREFIX}/${pathMode}`
    }
    if (dateSuffix && !params.has('date')) return `${pathname}${dateSuffix}`
  }

  return null
}

/** Read mode from current legacy URL helpers (query then hash). */
export function readLegacyModeId(
  search = typeof window !== 'undefined' ? window.location.search : '',
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const fromQuery = params.get('mode')
  if (fromQuery && MODE_IDS.has(fromQuery) && getMode(fromQuery)) return fromQuery
  const fromHash = hash.replace(/^#/, '').trim()
  if (fromHash && MODE_IDS.has(fromHash) && getMode(fromHash)) return fromHash
  return null
}
