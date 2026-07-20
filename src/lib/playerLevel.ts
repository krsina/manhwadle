/** Player level derived from lifetime shop XP (points earned, not current balance). */

export const PLAYER_LEVEL_CAP = 99

/** Base shop XP for a correct daily solve (before first-try / streak). */
export const PLAY_XP_BASE = 100
/** Extra XP when the series is solved on the opening guess. */
export const PLAY_XP_FIRST_TRY_BONUS = 3
/** Extra XP for golden solve (first-try + correct bonus name). */
export const PLAY_XP_GOLDEN_BONUS = 3
/** @deprecated Use PLAY_XP_GOLDEN_BONUS */
export const PLAY_XP_DOUBLE_SOLVE_BONUS = PLAY_XP_GOLDEN_BONUS
/** Flat bonus once all required modes are complete for the UTC day. */
export const PLAY_XP_ALL_MODES_BONUS = 16
/** Modes that count toward a full daily clear. */
export const PLAY_XP_MODES_PER_DAY = 4
/** Cap on the any-mode streak XP multiplier. */
export const PLAY_XP_STREAK_MULT_CAP = 1.5
/** Per-day streak step after day 1 (streak 11+ hits the cap). */
export const PLAY_XP_STREAK_MULT_STEP = 0.05

/** Minimum daily play-XP anticheat cap (~1.15× day-1 all-mode XP). */
export const PLAY_XP_DAILY_CAP_MIN = 478
/** Maximum daily play-XP anticheat cap (~1.15× streak-capped max day). */
export const PLAY_XP_DAILY_CAP_MAX = 759

/**
 * Calendar days of consistent all-mode play to advance from `level` → level+1.
 * Early: 1,1,2,2,3 then grows ~sqrt; sum to L99 ≈ 748 days (~2.05 years).
 */
export function daysToAdvanceFromLevel(level: number): number {
  const n = Math.max(1, Math.floor(level))
  if (n <= 2) return 1
  if (n <= 4) return 2
  if (n === 5) return 3
  return Math.max(3, Math.round(Math.sqrt(n) * 1.15))
}

/**
 * Any-mode streak multiplier mirroring `app_private.play_xp_streak_multiplier`.
 * Day 1 → 1.0×; +0.05 per extra day; capped at 1.5× (streak 11+).
 */
export function streakXpMultiplier(anyCurrentStreak: number): number {
  const streak = Math.max(0, Math.floor(anyCurrentStreak))
  return Math.min(
    PLAY_XP_STREAK_MULT_CAP,
    1 + PLAY_XP_STREAK_MULT_STEP * Math.max(0, streak - 1),
  )
}

/** Normal all-modes day XP (base clears + all-modes bonus, no skill bonuses). */
export function expectedDayPlayXp(anyCurrentStreak: number): number {
  const mult = streakXpMultiplier(anyCurrentStreak)
  return (
    Math.floor(PLAY_XP_BASE * PLAY_XP_MODES_PER_DAY * mult) +
    Math.floor(PLAY_XP_ALL_MODES_BONUS * mult)
  )
}

/** Max all-modes day XP with first-try + golden on every mode (+10% over normal at streak 1). */
export function maxDayPlayXp(anyCurrentStreak: number): number {
  const mult = streakXpMultiplier(anyCurrentStreak)
  const perMode = PLAY_XP_BASE + PLAY_XP_FIRST_TRY_BONUS + PLAY_XP_GOLDEN_BONUS
  return (
    Math.floor(perMode * PLAY_XP_MODES_PER_DAY * mult) +
    Math.floor(PLAY_XP_ALL_MODES_BONUS * mult)
  )
}

/**
 * Lifetime play XP after `days` of consistent all-mode clears with streak ramp
 * (mirrors server threshold simulation).
 */
export function expectedPlayXpAfterDays(days: number): number {
  const safe = Math.max(0, Math.floor(days))
  let xp = 0
  for (let d = 1; d <= safe; d += 1) {
    xp += expectedDayPlayXp(d)
  }
  return xp
}

/** Cumulative lifetime XP required to reach `level` (level 1 starts at 0). */
export function xpThresholdForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  if (safe <= 1) return 0
  let days = 0
  for (let from = 1; from < safe; from += 1) {
    days += daysToAdvanceFromLevel(from)
  }
  return expectedPlayXpAfterDays(days)
}

/** XP required to advance from `level` to `level + 1`. */
export function xpToAdvanceFromLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  if (safe >= PLAYER_LEVEL_CAP) {
    return Math.max(1, xpToAdvanceFromLevel(PLAYER_LEVEL_CAP - 1))
  }
  return Math.max(1, xpThresholdForLevel(safe + 1) - xpThresholdForLevel(safe))
}

/** Server anticheat daily play-XP cap for a player at `level`. */
export function playXpDailyCap(level: number): number {
  const raw = Math.ceil(xpToAdvanceFromLevel(level) * 1.25)
  return Math.min(PLAY_XP_DAILY_CAP_MAX, Math.max(PLAY_XP_DAILY_CAP_MIN, raw))
}

export interface PlayerLevelProgress {
  level: number
  lifetimeXp: number
  /** XP earned within the current level. */
  xpIntoLevel: number
  /** XP needed to advance from this level to the next. */
  xpForNext: number
  /** 0–1 progress toward the next level. */
  progress: number
}

export function playerLevelFromXp(lifetimeXp: number): PlayerLevelProgress {
  const xp = Math.max(0, Math.floor(lifetimeXp))
  let level = 1
  while (level < PLAYER_LEVEL_CAP && xpThresholdForLevel(level + 1) <= xp) {
    level += 1
  }
  const current = xpThresholdForLevel(level)
  const next = level >= PLAYER_LEVEL_CAP ? current : xpThresholdForLevel(level + 1)
  const span = Math.max(1, next - current)
  const into = Math.min(span, Math.max(0, xp - current))
  return {
    level,
    lifetimeXp: xp,
    xpIntoLevel: into,
    xpForNext: span,
    progress: level >= PLAYER_LEVEL_CAP ? 1 : into / span,
  }
}

/** Win play XP before the golden-solve follow-up (server awards on completion). */
export function playXpForWin(input: {
  firstTry: boolean
  anyCurrentStreak: number
}): number {
  const base = PLAY_XP_BASE + (input.firstTry ? PLAY_XP_FIRST_TRY_BONUS : 0)
  return Math.floor(base * streakXpMultiplier(input.anyCurrentStreak))
}

/** Golden-solve follow-up XP (server awards after a verified first-try win). */
export function playXpForGoldenSolve(anyCurrentStreak: number): number {
  return Math.floor(PLAY_XP_GOLDEN_BONUS * streakXpMultiplier(anyCurrentStreak))
}

/** @deprecated Use playXpForGoldenSolve */
export function playXpForDoubleSolve(anyCurrentStreak: number): number {
  return playXpForGoldenSolve(anyCurrentStreak)
}

/** All-modes day bonus (server awards when the day becomes all_complete). */
export function playXpForAllModesDay(anyCurrentStreak: number): number {
  return Math.floor(PLAY_XP_ALL_MODES_BONUS * streakXpMultiplier(anyCurrentStreak))
}

/** Total calendar days of consistent play to reach level 99 from level 1. */
export function daysToReachLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  if (safe <= 1) return 0
  let days = 0
  for (let from = 1; from < safe; from += 1) {
    days += daysToAdvanceFromLevel(from)
  }
  return days
}
