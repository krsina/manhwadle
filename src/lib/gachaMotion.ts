/** Carousel spin duration. */
export const GACHA_CAROUSEL_MS = 1800

/**
 * Cubic-bezier(0.22, 0.02, 0.52, 1): short wind-up, then a continuous
 * decelerate so the fast-to-slow handoff never seams.
 */
const BEZIER_X1 = 0.22
const BEZIER_Y1 = 0.02
const BEZIER_X2 = 0.52
const BEZIER_Y2 = 1

const CX = 3 * BEZIER_X1
const BX = 3 * (BEZIER_X2 - BEZIER_X1) - CX
const AX = 1 - CX - BX
const CY = 3 * BEZIER_Y1
const BY = 3 * (BEZIER_Y2 - BEZIER_Y1) - CY
const AY = 1 - CY - BY

function sampleX(s: number): number {
  return ((AX * s + BX) * s + CX) * s
}

function sampleY(s: number): number {
  return ((AY * s + BY) * s + CY) * s
}

function sampleDX(s: number): number {
  return (3 * AX * s + 2 * BX) * s + CX
}

function solveX(x: number): number {
  let s = x
  for (let i = 0; i < 8; i += 1) {
    const d = sampleDX(s)
    if (Math.abs(d) < 1e-6) break
    s -= (sampleX(s) - x) / d
    if (s < 0) s = 0
    else if (s > 1) s = 1
  }
  return s
}

export function gachaSpinEase(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  if (x <= 0) return 0
  if (x >= 1) return 1
  return sampleY(solveX(x))
}
