import { describe, expect, it } from 'vitest'
import { toGachaRarity, type GachaRarity } from './gacha'
import { PLAY_XP_BASE, PLAY_XP_MODES_PER_DAY } from './playerLevel'
import {
  GACHA_PULL_COST,
  GACHA_WEEKLY_DAYS,
  GACHA_WEEKLY_PRICES,
  gachaWeeklyPrice,
  isoWeekKey,
  msUntilNextMondayUtc,
  nextMondayUtc,
  weeklyFeaturedCharacters,
  weeklyFeaturedPrice,
} from './gachaWeekly'

describe('gacha weekly featured', () => {
  it('keeps a UTC Monday week key stable through the week', () => {
    const monday = new Date(Date.UTC(2026, 7, 17))
    const wednesday = new Date(Date.UTC(2026, 7, 19, 15, 30))
    const sunday = new Date(Date.UTC(2026, 7, 23, 23, 59))
    const nextMonday = new Date(Date.UTC(2026, 7, 24))

    expect(isoWeekKey(monday)).toBe(isoWeekKey(wednesday))
    expect(isoWeekKey(sunday)).toBe(isoWeekKey(monday))
    expect(isoWeekKey(nextMonday)).not.toBe(isoWeekKey(monday))
    expect(nextMondayUtc(wednesday).toISOString()).toBe(nextMonday.toISOString())
    expect(msUntilNextMondayUtc(nextMonday)).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('picks four skins deterministically and changes them next week', () => {
    const weekA = new Date(Date.UTC(2026, 7, 19))
    const weekB = new Date(Date.UTC(2026, 7, 26))
    const first = weeklyFeaturedCharacters(weekA)
    const again = weeklyFeaturedCharacters(weekA)
    const next = weeklyFeaturedCharacters(weekB)

    expect(first).toHaveLength(4)
    expect(again.map((character) => character.id)).toEqual(first.map((character) => character.id))
    expect(new Set(first.map((character) => character.id)).size).toBe(4)
    expect(next.map((character) => character.id)).not.toEqual(first.map((character) => character.id))

    const rarities = first.map((character) => toGachaRarity(character.rarity))
    expect(rarities.filter((rarity) => rarity === 'common').length).toBeGreaterThanOrEqual(1)
    expect(rarities.filter((rarity) => rarity === 'rare').length).toBeGreaterThanOrEqual(1)
    expect(rarities.filter((rarity) => rarity === 'epic').length).toBeGreaterThanOrEqual(1)
  })

  it('prices a pull as four mode clears and featured buys on round day multiples', () => {
    expect(GACHA_PULL_COST).toBe(PLAY_XP_BASE * PLAY_XP_MODES_PER_DAY)
    expect(GACHA_PULL_COST).toBe(400)
    expect(GACHA_WEEKLY_PRICES).toEqual({
      common: 1200,
      rare: 2000,
      epic: 4000,
      legendary: 6000,
    })
    expect(GACHA_WEEKLY_PRICES.common).toBe(GACHA_PULL_COST * GACHA_WEEKLY_DAYS.common)
    expect(GACHA_WEEKLY_PRICES.rare).toBe(GACHA_PULL_COST * GACHA_WEEKLY_DAYS.rare)
    expect(GACHA_WEEKLY_PRICES.epic).toBe(GACHA_PULL_COST * GACHA_WEEKLY_DAYS.epic)
    expect(GACHA_WEEKLY_PRICES.legendary).toBe(GACHA_PULL_COST * GACHA_WEEKLY_DAYS.legendary)

    const rarities: GachaRarity[] = ['common', 'rare', 'epic', 'legendary']
    for (const rarity of rarities) {
      expect(gachaWeeklyPrice(rarity)).toBeGreaterThan(GACHA_PULL_COST)
      expect(gachaWeeklyPrice(rarity)).toBe(GACHA_WEEKLY_PRICES[rarity])
    }

    const featured = weeklyFeaturedCharacters(new Date(Date.UTC(2026, 7, 19)))
    for (const character of featured) {
      expect(weeklyFeaturedPrice(character)).toBeGreaterThan(GACHA_PULL_COST)
      expect(weeklyFeaturedPrice(character)).toBe(gachaWeeklyPrice(toGachaRarity(character.rarity)))
    }
  })
})
