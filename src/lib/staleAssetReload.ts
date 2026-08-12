/**
 * After a Cloudflare Pages deploy, hashed chunk URLs change. Tabs that still
 * hold the old shell fail on the next lazy route with
 * "Failed to fetch dynamically imported module". Reload once onto the new
 * index so users do not have to press Reload manually.
 */

const RELOAD_AT_KEY = 'manhwadle:stale-asset-reload-at'
/** Ignore a second reload within this window to avoid tight loops on cached HTML. */
const RELOAD_COOLDOWN_MS = 15_000

const STALE_ASSET_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /loading css chunk/i,
  /loading chunk [\w.-]+ failed/i,
  /chunkloaderror/i,
]

export function isStaleAssetError(error: unknown): boolean {
  if (!error) return false
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : ''
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : String(error)
  if (name === 'ChunkLoadError') return true
  return STALE_ASSET_PATTERNS.some((pattern) => pattern.test(message))
}

function lastReloadAt(): number {
  try {
    const raw = sessionStorage.getItem(RELOAD_AT_KEY)
    if (!raw) return 0
    const value = Number(raw)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function markReloadAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()))
  } catch {
    // private mode / blocked storage — still attempt reload
  }
}

/** Returns true when a reload was started (caller should stop rendering). */
export function reloadForStaleAssets(reason = 'stale-asset'): boolean {
  if (typeof window === 'undefined') return false
  const now = Date.now()
  if (now - lastReloadAt() < RELOAD_COOLDOWN_MS) return false
  markReloadAttempt()
  try {
    // Help debugging in support without noisy monitoring.
    console.info(`[manhwadle] Reloading for ${reason}`)
  } catch {
    // ignore
  }
  window.location.reload()
  return true
}

/**
 * Vite emits this when a preloaded module/CSS fails after a deploy.
 * Also catches unhandled dynamic-import rejections.
 */
export function installStaleAssetReloadHandlers(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadForStaleAssets('vite-preload')
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleAssetError(event.reason)) return
    if (reloadForStaleAssets('unhandled-dynamic-import')) {
      event.preventDefault()
    }
  })
}
