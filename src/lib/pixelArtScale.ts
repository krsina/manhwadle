/**
 * Style A plates are authored at 256×256. Nearest-neighbor only looks clean when
 * the bitmap lands on whole **device** pixels — CSS-integer sizes are not enough
 * on Windows 125%/150% display scaling (DPR 1.25 / 1.5).
 *
 * Non-integer scales from 256 (e.g. 256→112) look muddy even with smoothing off,
 * because source pixels map to 2 or 3 dest pixels irregularly. Prefer exact
 * integer down/up scales only.
 */

export type PixelArtScale = {
  /** Element box in CSS pixels (may be fractional when DPR is fractional). */
  cssPx: number
  /** Canvas / bitmap edge length in device pixels. */
  devicePx: number
}

/** Exact integer down/up scales from a master plate (cleanest NN). */
export function exactPixelArtDeviceSizes(nativePx = 256): number[] {
  const sizes: number[] = []
  for (let div = 1; div <= nativePx; div += 1) {
    if (nativePx % div !== 0) continue
    sizes.push(nativePx / div)
  }
  for (let mul = 2; mul <= 4; mul += 1) {
    sizes.push(nativePx * mul)
  }
  return sizes.sort((a, b) => a - b)
}

/**
 * Pick a scale that fits `availableCssPx` and maps 1:1 onto device pixels.
 * Always prefers an exact integer scale from the 256 plate when one fits.
 */
export function snapPixelArtScale(
  availableCssPx: number,
  dpr = 1,
  nativePx = 256,
): PixelArtScale {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const roomDevice = Math.max(1, Math.floor(Math.max(0, availableCssPx) * d))

  const exact = exactPixelArtDeviceSizes(nativePx).filter((side) => side <= roomDevice)
  const devicePx = exact.length > 0 ? Math.max(...exact) : roomDevice

  return { devicePx, cssPx: devicePx / d }
}

/** @deprecated Prefer snapPixelArtScale — CSS-only snaps smear under fractional DPR. */
export function snapPixelArtDisplaySize(availablePx: number, nativePx = 256): number {
  return snapPixelArtScale(availablePx, 1, nativePx).devicePx
}

/** Bust crop: head + slight upper torso (matches CSS scale ~3.15 / 22%). */
export function bustSourceRect(nativePx = 256): {
  sx: number
  sy: number
  sw: number
  sh: number
} {
  const zoom = 3.15
  const sw = Math.round(nativePx / zoom)
  const sh = sw
  const sx = Math.round((nativePx - sw) / 2)
  const focusY = nativePx * 0.22
  const sy = Math.round(Math.min(Math.max(focusY - sh * 0.22, 0), nativePx - sh))
  return { sx, sy, sw, sh }
}
