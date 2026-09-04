import { hashString } from './daily'
import {
  gachaPool,
  gachaPoolByRarity,
  toGachaRarity,
  type GachaRarity,
} from './gacha'
import type { AvatarCharacterMeta } from './avatarComposition'
import { PLAY_XP_BASE, PLAY_XP_MODES_PER_DAY } from './playerLevel'

/** Four daily mode clears at base XP. Streak / all-modes bonus is leftover. */
export const GACHA_PULL_COST = PLAY_XP_BASE * PLAY_XP_MODES_PER_DAY

/** All-mode days of play to buy a featured skin instead of rolling. */
export const GACHA_WEEKLY_DAYS: Record<GachaRarity, number> = {
  common: 3,
  rare: 5,
  epic: 10,
  legendary: 15,
}

export const GACHA_WEEKLY_PRICES: Record<GachaRarity, number> = {
  common: 1200,
  rare: 2000,
  epic: 4000,
  legendary: 6000,
}

const WEEKLY_SLOTS: readonly GachaRarity[] = ['common', 'rare', 'rare', 'epic']
const FALLBACK_BANDS: readonly GachaRarity[] = ['rare', 'epic', 'common']

export function gachaWeeklyPrice(rarity: GachaRarity): number {
  return GACHA_WEEKLY_PRICES[rarity]
}

/** ISO week key `YYYY-Www` in UTC (Monday-based). */
export function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const isoYear = utc.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

export function startOfIsoWeekUtc(date: Date): Date {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() - (day - 1))
  return utc
}

export function nextMondayUtc(date: Date): Date {
  const start = startOfIsoWeekUtc(date)
  const next = new Date(start)
  next.setUTCDate(start.getUTCDate() + 7)
  return next
}

export function msUntilNextMondayUtc(now = new Date()): number {
  return Math.max(0, nextMondayUtc(now).getTime() - now.getTime())
}

function seededUnitRng(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function takeOne(
  pool: readonly AvatarCharacterMeta[],
  rng: () => number,
  used: Set<string>,
): AvatarCharacterMeta | null {
  const available = pool.filter((character) => !used.has(character.id))
  if (available.length === 0) return null
  const index = Math.min(available.length - 1, Math.floor(rng() * available.length))
  return available[index]!
}

export function weeklyFeaturedCharacters(now = new Date()): AvatarCharacterMeta[] {
  const week = isoWeekKey(now)
  const rng = seededUnitRng(hashString(`gacha-week:${week}`))
  const used = new Set<string>()
  const featured: AvatarCharacterMeta[] = []

  for (const rarity of WEEKLY_SLOTS) {
    const picked =
      takeOne(gachaPoolByRarity(rarity), rng, used) ??
      FALLBACK_BANDS.reduce<AvatarCharacterMeta | null>(
        (found, band) => found ?? takeOne(gachaPoolByRarity(band), rng, used),
        null,
      ) ??
      takeOne(gachaPool(), rng, used)
    if (!picked) continue
    used.add(picked.id)
    featured.push(picked)
  }

  return featured
}

export function isWeeklyFeaturedId(characterId: string, now = new Date()): boolean {
  return weeklyFeaturedCharacters(now).some((character) => character.id === characterId)
}

export function weeklyFeaturedPrice(character: AvatarCharacterMeta): number {
  return gachaWeeklyPrice(toGachaRarity(character.rarity))
}
