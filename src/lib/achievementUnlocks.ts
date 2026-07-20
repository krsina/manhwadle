const SEEN_KEY = 'manhwadle:achievements:seen-v1'

/** Fired after server-side awards may have changed (e.g. daily visit ping). */
export const ACHIEVEMENTS_CHANGED_EVENT = 'manhwadle:achievements-changed'

export type AchievementsChangedDetail = {
  /** Ids known to have just been awarded (e.g. secret RPC). */
  awardedIds?: string[]
}

export function notifyAchievementsChanged(awardedIds?: string[]) {
  if (typeof window === 'undefined') return
  const detail: AchievementsChangedDetail =
    awardedIds && awardedIds.length > 0 ? { awardedIds } : {}
  window.dispatchEvent(
    new CustomEvent<AchievementsChangedDetail>(ACHIEVEMENTS_CHANGED_EVENT, { detail }),
  )
}

/** In-memory mirror so tests / blocked storage still behave correctly. */
let memorySeen: Set<string> | null = null

/** True after the first server sync (or an immediate claim) this session. */
let hydrated = false

function readSeen(): Set<string> {
  if (memorySeen) return new Set(memorySeen)
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    const ids = new Set(parsed.filter((id): id is string => typeof id === 'string'))
    memorySeen = new Set(ids)
    return ids
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Set<string>) {
  memorySeen = new Set(ids)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore quota / private mode.
  }
}

export function hasHydratedAchievements(): boolean {
  return hydrated
}

/** Seed existing awards without toasting. Call once after login sync. */
export function seedSeenAchievements(awardIds: string[]) {
  const seen = readSeen()
  for (const id of awardIds) seen.add(id)
  writeSeen(seen)
  hydrated = true
}

/**
 * Returns newly earned award ids and marks them seen.
 * Before hydration, seeds without toasting (initial sync).
 * After hydration, returns only ids not yet seen.
 */
export function consumeNewAchievementIds(awardIds: string[]): string[] {
  if (!hydrated) {
    seedSeenAchievements(awardIds)
    return []
  }
  const seen = readSeen()
  const fresh = awardIds.filter((id) => !seen.has(id))
  if (fresh.length === 0) return []
  for (const id of fresh) seen.add(id)
  writeSeen(seen)
  return fresh
}

/**
 * Claim freshly awarded ids for an immediate toast (secrets, etc.).
 * Safe before or after hydration — always returns ids not yet seen.
 */
export function claimFreshAchievementIds(awardIds: string[]): string[] {
  const seen = readSeen()
  const fresh = awardIds.filter((id) => !seen.has(id))
  if (fresh.length === 0) {
    hydrated = true
    return []
  }
  for (const id of fresh) seen.add(id)
  writeSeen(seen)
  hydrated = true
  return fresh
}

/** Forget specific ids so a real server re-grant can toast again. */
export function unseeAchievementIds(ids: string[]) {
  if (ids.length === 0) return
  const seen = readSeen()
  let changed = false
  for (const id of ids) {
    if (seen.delete(id)) changed = true
  }
  if (changed) writeSeen(seen)
}

/** DEV helper — forget seen unlocks so the next sync/earn can toast again. */
export function clearSeenAchievements() {
  memorySeen = new Set()
  hydrated = true
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(SEEN_KEY)
  } catch {
    // Ignore.
  }
}

/** Drop hydration only (logout). Keeps seen ids so re-login does not re-toast. */
export function resetAchievementUnlockHydration() {
  hydrated = false
}

/** Full reset for tests. */
export function resetAchievementUnlockSession() {
  hydrated = false
  memorySeen = null
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(SEEN_KEY)
  } catch {
    // Ignore.
  }
}
