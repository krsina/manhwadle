export type CelebrationMotionTier = 'full' | 'lite'

export interface CelebrationMotionHints {
  reducedMotion?: boolean
  coarsePointer?: boolean
  narrowViewport?: boolean
  saveData?: boolean
}

export interface ConfettiBurstPlan {
  centerCount: number
  sideCount: number
  ringCount: number
  ringParticles: number
  stars: boolean
  rotate: boolean
  gravity: number
  dprCap: number
}

export interface BonusCelebratePlan {
  firstBurst: number
  extraBurst: number
  extraIntervalMs: number
  maxBursts: number
  stars: number
  durationMs: number
  rotate: boolean
  dprCap: number
  rings: boolean
}

export interface CelebrationCanvases {
  confetti: boolean
  bonus: boolean
}

/** Touch / small screens / data-saver get a cheaper celebration budget. */
export function celebrationMotionTier(
  hints: CelebrationMotionHints = {},
): CelebrationMotionTier {
  if (hints.reducedMotion) return 'lite'
  if (hints.coarsePointer || hints.narrowViewport || hints.saveData) return 'lite'
  return 'full'
}

export function readCelebrationMotionTier(): CelebrationMotionTier {
  if (typeof window === 'undefined') return 'full'
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  return celebrationMotionTier({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    narrowViewport: window.matchMedia('(max-width: 640px)').matches,
    saveData: Boolean(nav.connection?.saveData),
  })
}

export function confettiCanvasDpr(
  devicePixelRatio: number,
  tier: CelebrationMotionTier,
): number {
  const cap = tier === 'lite' ? 1 : 2
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.min(dpr, cap)
}

export function confettiBurstPlan(
  width: number,
  height: number,
  firstTry: boolean,
  tier: CelebrationMotionTier,
): ConfettiBurstPlan {
  const area = Math.max(0, width) * Math.max(0, height)
  if (tier === 'lite') {
    return {
      centerCount: firstTry
        ? Math.min(48, Math.floor(area / 18000) + 24)
        : Math.min(32, Math.floor(area / 22000) + 16),
      sideCount: firstTry ? 10 : 6,
      ringCount: 0,
      ringParticles: 0,
      stars: false,
      rotate: false,
      gravity: firstTry ? 0.18 : 0.22,
      dprCap: 1,
    }
  }

  return {
    centerCount: firstTry
      ? Math.min(280, Math.floor(area / 4500) + 180)
      : Math.min(140, Math.floor(area / 9000) + 80),
    sideCount: firstTry ? 80 : 36,
    ringCount: firstTry ? 3 : 0,
    ringParticles: firstTry ? 34 : 0,
    stars: firstTry,
    rotate: true,
    gravity: firstTry ? 0.14 : 0.18,
    dprCap: 2,
  }
}

export function bonusCelebratePlan(tier: CelebrationMotionTier): BonusCelebratePlan {
  if (tier === 'lite') {
    return {
      firstBurst: 24,
      extraBurst: 0,
      extraIntervalMs: 1100,
      maxBursts: 1,
      stars: 0,
      durationMs: 1200,
      rotate: false,
      dprCap: 1,
      rings: false,
    }
  }

  return {
    firstBurst: 150,
    extraBurst: 70,
    extraIntervalMs: 800,
    maxBursts: Number.POSITIVE_INFINITY,
    stars: 55,
    durationMs: Number.POSITIVE_INFINITY,
    rotate: true,
    dprCap: 2,
    rings: true,
  }
}

/** Double-solve is already a first-try win — never run both canvases at once. */
export function celebrationCanvases(
  won: boolean,
  doubleSolve: boolean,
): CelebrationCanvases {
  if (!won) return { confetti: false, bonus: false }
  if (doubleSolve) return { confetti: false, bonus: true }
  return { confetti: true, bonus: false }
}
