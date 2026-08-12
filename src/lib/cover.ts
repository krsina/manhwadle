import type { Manhwa } from './anilist-types'
import { clampFocus, cropPixelScale, cropZoomScale } from './crops'
import { hashString } from './daily'

// Re-export zoom/pixel helpers so Cover mode can share Character's ladders.
export { clampFocus, cropPixelScale, cropZoomScale }

/** Titles with a usable cover art URL. */
export function manhwaHasCover(manhwa: Manhwa): boolean {
  return Boolean(manhwa.coverImage?.trim())
}

/**
 * Deterministic focus origin for cover zooms (biased toward upper/center
 * where faces and titles usually sit).
 */
export function coverFocusOrigin(
  manhwaId: number,
  dateKey: string,
  seedPrefix: string,
): { focusX: number; focusY: number } {
  const h = hashString(`${seedPrefix}-cover-focus-${dateKey}-${manhwaId}`)
  return {
    focusX: clampFocus(35 + (h % 31)),
    focusY: clampFocus(22 + ((h >>> 8) % 29), 35),
  }
}
