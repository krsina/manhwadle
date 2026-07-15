/** Target simulation rate for canvas particle effects (matches original 60fps tuning). */
export const ANIM_FRAME_MS = 1000 / 60

/**
 * Scale factor so per-frame physics stay consistent across refresh rates.
 * Clamped so a long tab-sleep hitch doesn't explode the simulation.
 */
export function frameScale(deltaMs: number, max = 2.5): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 1
  return Math.min(max, deltaMs / ANIM_FRAME_MS)
}
