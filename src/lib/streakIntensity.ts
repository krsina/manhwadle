/** Visual intensity tiers for the header streak badge. */

export type StreakTier =
  | 'cold'
  | 'ember'
  | 'flame'
  | 'blaze'
  | 'inferno'
  | 'legendary'

export function streakTier(streak: number): StreakTier {
  if (streak <= 0) return 'cold'
  if (streak < 3) return 'ember'
  if (streak < 7) return 'flame'
  if (streak < 14) return 'blaze'
  if (streak < 30) return 'inferno'
  return 'legendary'
}

export const STREAK_PRESETS = [0, 1, 3, 7, 14, 30, 50, 100] as const
