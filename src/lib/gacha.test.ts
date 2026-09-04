import { describe, expect, it } from 'vitest'
import { AVATAR_CHARACTER_META } from './avatarComposition'
import {
  GACHA_HARD_PITY,
  GACHA_RATES,
  GACHA_SOFT_PITY,
  GACHA_UPGRADE_DUPLICATES,
  emptyGachaPity,
  gachaDuplicateCount,
  applyGachaCopySpend,
  canSpendGachaCopies,
  remainingCopiesAfterSpend,
  gachaPityCountdown,
  gachaPool,
  gachaPoolByRarity,
  gachaSpinPool,
  gachaExchangeTargetRarity,
  nextGachaRarity,
  rollGacha,
  rollGachaUpgrade,
  starterOwnedIds,
  toGachaRarity,
  type GachaPityState,
  type GachaRng,
} from './gacha'

function sequenceRng(values: number[]): GachaRng {
  let index = 0
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0
    index += 1
    return value
  }
}

function always(value: number): GachaRng {
  return () => value
}

const emptyOwned = new Set<string>()

function pityAt(pullCount: number, pullsSinceRarePlus = 0): GachaPityState {
  return { pullCount, pullsSinceRarePlus }
}

describe('gacha pool', () => {
  it('excludes starters and keeps every other catalog character', () => {
    const starters = AVATAR_CHARACTER_META.filter((character) => character.starter)
    const pool = gachaPool()
    const poolIds = new Set(pool.map((character) => character.id))

    expect(starters.length).toBeGreaterThan(0)
    for (const starter of starters) {
      expect(poolIds.has(starter.id)).toBe(false)
    }
    expect(pool).toHaveLength(AVATAR_CHARACTER_META.length - starters.length)
  })

  it('groups pullable characters into common / rare / epic bands', () => {
    expect(gachaPoolByRarity('common').length).toBeGreaterThan(0)
    expect(gachaPoolByRarity('rare').length).toBeGreaterThan(0)
    expect(gachaPoolByRarity('epic').length).toBeGreaterThan(0)
    expect(
      gachaPoolByRarity('common').every((character) => toGachaRarity(character.rarity) === 'common'),
    ).toBe(true)
    expect(
      gachaPoolByRarity('rare').every((character) => toGachaRarity(character.rarity) === 'rare'),
    ).toBe(true)
    expect(
      gachaPoolByRarity('epic').every((character) => toGachaRarity(character.rarity) === 'epic'),
    ).toBe(true)
  })

  it('spins the legendary band from its own plates', () => {
    expect(gachaPoolByRarity('legendary').length).toBeGreaterThan(0)
    expect(
      gachaPoolByRarity('legendary').every(
        (character) => toGachaRarity(character.rarity) === 'legendary',
      ),
    ).toBe(true)
    expect(gachaSpinPool('legendary')).toEqual(gachaPoolByRarity('legendary'))
  })

  it('seeds demo ownership with starters only', () => {
    const owned = starterOwnedIds()
    expect(owned.size).toBeGreaterThan(0)
    for (const id of owned) {
      expect(gachaPool().some((character) => character.id === id)).toBe(false)
    }
  })
})

describe('gachaPityCountdown', () => {
  it('counts remaining pulls until rare+ and epic', () => {
    expect(gachaPityCountdown(emptyGachaPity())).toEqual({ untilRarePlus: GACHA_SOFT_PITY, untilEpic: GACHA_HARD_PITY })
    expect(gachaPityCountdown(pityAt(28, 6))).toEqual({ untilRarePlus: 3, untilEpic: 12 })
    expect(gachaPityCountdown(pityAt(GACHA_HARD_PITY, GACHA_SOFT_PITY))).toEqual({
      untilRarePlus: 0,
      untilEpic: GACHA_HARD_PITY,
    })
  })
})

describe('duplicate upgrades', () => {
  it('counts five owned copies as a full exchange, not four extras', () => {
    expect(GACHA_UPGRADE_DUPLICATES).toBe(5)
    expect(gachaDuplicateCount(1)).toBe(0)
    expect(gachaDuplicateCount(5)).toBe(4)
    expect(canSpendGachaCopies(5)).toBe(true)
  })

  it('spends five copies of the same character and keeps the remainder', () => {
    expect(canSpendGachaCopies(4)).toBe(false)
    expect(canSpendGachaCopies(5)).toBe(true)
    expect(remainingCopiesAfterSpend(5)).toBe(0)
    expect(remainingCopiesAfterSpend(6)).toBe(1)

    const spent = applyGachaCopySpend(new Map([['common-hero', 5]]), 'common-hero', 'rare-hero')
    expect(spent?.get('common-hero')).toBeUndefined()
    expect(spent?.get('rare-hero')).toBe(1)

    const leftover = applyGachaCopySpend(new Map([['common-hero', 6]]), 'common-hero', 'rare-hero')
    expect(leftover?.get('common-hero')).toBe(1)
    expect(leftover?.get('rare-hero')).toBe(1)

    const stacked = applyGachaCopySpend(
      new Map([
        ['common-hero', 5],
        ['rare-hero', 2],
      ]),
      'common-hero',
      'rare-hero',
    )
    expect(stacked?.get('common-hero')).toBeUndefined()
    expect(stacked?.get('rare-hero')).toBe(3)

    expect(applyGachaCopySpend(new Map([['common-hero', 4]]), 'common-hero', 'rare-hero')).toBeNull()
  })

  it('maps only to the direct next rarity, with same-band exchange at max', () => {
    expect(nextGachaRarity('common')).toBe('rare')
    expect(nextGachaRarity('rare')).toBe('epic')
    expect(nextGachaRarity('epic')).toBe('legendary')
    expect(nextGachaRarity('legendary')).toBeNull()
    expect(gachaExchangeTargetRarity('common')).toBe('rare')
    expect(gachaExchangeTargetRarity('rare')).toBe('epic')
    expect(gachaExchangeTargetRarity('epic')).toBe('legendary')
    expect(gachaExchangeTargetRarity('legendary')).toBe('legendary')
  })

  it('rerolls into exactly one tier higher without advancing pity', () => {
    const common = gachaPoolByRarity('common')[0]!
    const rare = gachaPoolByRarity('rare')[0]!
    const pity = pityAt(13, 4)

    const rareResult = rollGachaUpgrade(
      { character: common, ownedIds: emptyOwned, pity },
      always(0),
    )
    const epicResult = rollGachaUpgrade(
      { character: rare, ownedIds: emptyOwned, pity },
      always(0),
    )

    expect(rareResult?.rarity).toBe('rare')
    expect(epicResult?.rarity).toBe('epic')
    expect(rareResult?.pity).toBe(pity)
  })

  it('upgrades an epic duplicate into a legendary now that the band is stocked', () => {
    const epic = gachaPoolByRarity('epic')[0]!
    const pity = pityAt(13, 4)
    const result = rollGachaUpgrade({ character: epic, ownedIds: emptyOwned, pity }, always(0))

    expect(result).not.toBeNull()
    expect(result?.rarity).toBe('legendary')
    expect(gachaPoolByRarity('legendary').some((row) => row.id === result?.character.id)).toBe(true)
    expect(result?.pity).toBe(pity)
  })

  it('rerolls a legendary duplicate into a different legendary at the top band', () => {
    const legendary = gachaPoolByRarity('legendary')[0]!
    const pity = pityAt(13, 4)
    const result = rollGachaUpgrade({ character: legendary, ownedIds: emptyOwned, pity }, always(0))

    expect(result?.rarity).toBe('legendary')
    expect(result?.character.id).not.toBe(legendary.id)
  })
})

describe('rollGacha', () => {
  it('honors forced rarity over rates and pity', () => {
    const common = rollGacha(
      { pity: pityAt(GACHA_HARD_PITY - 1, GACHA_SOFT_PITY), ownedIds: emptyOwned, forceRarity: 'common' },
      always(0),
    )
    const rare = rollGacha(
      { pity: emptyGachaPity(), ownedIds: emptyOwned, forceRarity: 'rare' },
      always(0),
    )
    const epic = rollGacha(
      { pity: emptyGachaPity(), ownedIds: emptyOwned, forceRarity: 'epic' },
      always(0),
    )

    expect(common.rarity).toBe('common')
    expect(gachaPoolByRarity('common').some((character) => character.id === common.character.id)).toBe(
      true,
    )
    expect(rare.rarity).toBe('rare')
    expect(epic.rarity).toBe('epic')
  })

  it('uses weighted bands when pity is not in play', () => {
    expect(GACHA_RATES).toEqual({ common: 0.45, rare: 0.34, epic: 0.2, legendary: 0.01 })
    const common = rollGacha({ pity: emptyGachaPity(), ownedIds: emptyOwned }, sequenceRng([0.44, 0]))
    const rare = rollGacha({ pity: emptyGachaPity(), ownedIds: emptyOwned }, sequenceRng([0.45, 0]))
    const epic = rollGacha({ pity: emptyGachaPity(), ownedIds: emptyOwned }, sequenceRng([0.79, 0]))
    // Legendary band starts at 0.99.
    const legendary = rollGacha(
      { pity: emptyGachaPity(), ownedIds: emptyOwned },
      sequenceRng([0.995, 0]),
    )

    expect(common.rarity).toBe('common')
    expect(rare.rarity).toBe('rare')
    expect(epic.rarity).toBe('epic')
    expect(legendary.rarity).toBe('legendary')
    expect(toGachaRarity(legendary.character.rarity)).toBe('legendary')
  })

  it('honors forced legendary even when the catalog has no legendary plates', () => {
    const forced = rollGacha(
      { pity: emptyGachaPity(), ownedIds: emptyOwned, forceRarity: 'legendary' },
      always(0),
    )
    expect(forced.rarity).toBe('legendary')
    expect(gachaSpinPool('legendary').some((character) => character.id === forced.character.id)).toBe(
      true,
    )
  })

  it('upgrades a common roll to rare after nine non-rare+ pulls', () => {
    const result = rollGacha(
      { pity: pityAt(3, GACHA_SOFT_PITY), ownedIds: emptyOwned },
      sequenceRng([0, 0]),
    )
    expect(result.rarity).toBe('rare')
    expect(result.pity.pullsSinceRarePlus).toBe(0)
    expect(result.pity.pullCount).toBe(4)
  })

  it('forces epic on every 40th pull', () => {
    const result = rollGacha(
      { pity: pityAt(GACHA_HARD_PITY - 1), ownedIds: emptyOwned },
      sequenceRng([0, 0]),
    )
    expect(result.rarity).toBe('epic')
    expect(result.pity.pullCount).toBe(GACHA_HARD_PITY)
    expect(result.pity.pullsSinceRarePlus).toBe(0)
  })

  it('marks duplicates as owned and increments pity on commons', () => {
    const first = rollGacha({ pity: emptyGachaPity(), ownedIds: emptyOwned }, sequenceRng([0, 0]))
    expect(first.isNew).toBe(true)

    const duplicate = rollGacha(
      { pity: first.pity, ownedIds: new Set([first.character.id]) },
      sequenceRng([0, 0]),
    )
    expect(duplicate.character.id).toBe(first.character.id)
    expect(duplicate.isNew).toBe(false)
    expect(duplicate.pity.pullsSinceRarePlus).toBe(first.pity.pullsSinceRarePlus + 1)
  })
})
