import type { StaffRole } from './moderationApi'

/**
 * Local Vite DEV tools (test unlocks, solve SFX, fake calendars, etc.) are
 * owner-only. Production builds already tree-shake `import.meta.env.DEV` UI;
 * this also hides them from non-owners on shared local/staging DEV servers.
 *
 * Owners can flip "user mode" in the account menu to hide those tools and
 * play as a normal signed-in user. The toggle itself stays available.
 *
 * `ownerDevSessionActive` mirrors the signed-in owner's effective access so
 * localStorage override helpers (leaderboard/archive fakes) only apply while
 * owner DEV UI is active — not under user mode or for other accounts.
 */

export const OWNER_USER_MODE_EVENT = 'manhwadle:owner-user-mode'
const USER_MODE_STORAGE_KEY = 'manhwadle:owner-user-mode'

let lastSyncedRole: StaffRole | string | null | undefined = null
let ownerDevSessionActive = false
let userModeCached: boolean | null = null

function readUserModeFromStorage(): boolean {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(USER_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeUserModeToStorage(enabled: boolean): void {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined') return
  try {
    if (enabled) localStorage.setItem(USER_MODE_STORAGE_KEY, '1')
    else localStorage.removeItem(USER_MODE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function notifyUserModeChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OWNER_USER_MODE_EVENT))
}

function recomputeOwnerDevSession(): void {
  ownerDevSessionActive = canUseOwnerDevUi(lastSyncedRole)
}

/** Owner may see the user-mode toggle (DEV builds only). */
export function canShowOwnerUserModeToggle(
  role: StaffRole | string | null | undefined,
): boolean {
  return import.meta.env.DEV && role === 'owner'
}

/** Whether the owner currently wants a normal-user UI (no DEV tools). */
export function isOwnerUserModeEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  if (userModeCached == null) userModeCached = readUserModeFromStorage()
  return userModeCached
}

export function setOwnerUserModeEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return
  const next = Boolean(enabled)
  if (userModeCached === next) return
  userModeCached = next
  writeUserModeToStorage(next)
  recomputeOwnerDevSession()
  notifyUserModeChanged()
}

/** Owner DEV tools / privileged owner-only UI (false under user mode). */
export function canUseOwnerDevUi(
  role: StaffRole | string | null | undefined,
): boolean {
  return canShowOwnerUserModeToggle(role) && !isOwnerUserModeEnabled()
}

/** Call whenever the account snapshot changes (or clears on sign-out). */
export function syncOwnerDevSession(
  role: StaffRole | string | null | undefined,
): void {
  lastSyncedRole = role
  recomputeOwnerDevSession()
}

export function isOwnerDevSessionActive(): boolean {
  return ownerDevSessionActive
}

/** Test helper — clears in-memory user-mode cache (does not touch storage). */
export function resetOwnerUserModeCacheForTests(): void {
  userModeCached = null
  lastSyncedRole = null
  ownerDevSessionActive = false
}
