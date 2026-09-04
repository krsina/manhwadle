import { describe, expect, it } from 'vitest'
import { gachaPoolByRarity, remainingCopiesAfterSpend, rollGacha, emptyGachaPity } from './gacha'
import {
  applyExchangeToSnapshot,
  applyGachaPull,
  applyOwnedDelta,
  applyPreviewRoll,
  applyWeeklyPurchase,
  emptyGachaLocalSnapshot,
  gachaAvailablePoints,
  ownedMapToRecord,
  ownedRecordToMap,
  parseGachaLocalSnapshot,
  serializeGachaLocalSnapshot,
} from './gachaLocalStore'
import { GACHA_PULL_COST, weeklyFeaturedPrice } from './gachaWeekly'

describe('gacha local store', () => {
  it('round-trips point spends, pity, owned copies, and equipped id', () => {
    const rare = gachaPoolByRarity('rare')[0]!
    const snapshot = {
      ...emptyGachaLocalSnapshot(),
      pointsSpent: 17,
      pity: { pullCount: 9, pullsSinceRarePlus: 3 },
      owned: { ...emptyGachaLocalSnapshot().owned, [rare.id]: 5 },
      equippedAvatarId: rare.id,
      skip: true,
    }

    const parsed = parseGachaLocalSnapshot(JSON.parse(serializeGachaLocalSnapshot(snapshot)))
    expect(parsed.pointsSpent).toBe(17)
    expect(parsed.pity).toEqual({ pullCount: 9, pullsSinceRarePlus: 3 })
    expect(parsed.owned[rare.id]).toBe(5)
    expect(parsed.equippedAvatarId).toBe(rare.id)
    expect(parsed.skip).toBe(true)
    expect(gachaAvailablePoints(40, parsed.pointsSpent)).toBe(23)
  })

  it('falls back to starters when the payload is unusable', () => {
    const parsed = parseGachaLocalSnapshot({ pointsSpent: 'nope', owned: null })
    expect(parsed.pointsSpent).toBe(0)
    expect(Object.keys(parsed.owned).length).toBeGreaterThan(0)
  })

  it('spends shop points on a pull and adds a copy without dropping to 4/5 on five copies', () => {
    const common = gachaPoolByRarity('common')[0]!
    const rolled = rollGacha(
      { pity: emptyGachaPity(), ownedIds: new Set(), forceRarity: 'common' },
      () => 0,
    )
    const afterPull = applyGachaPull(emptyGachaLocalSnapshot(), rolled, GACHA_PULL_COST)
    expect(afterPull?.pointsSpent).toBe(GACHA_PULL_COST)
    expect(gachaAvailablePoints(GACHA_PULL_COST, afterPull?.pointsSpent ?? 0)).toBe(0)
    expect(afterPull?.pity.pullCount).toBe(1)
    expect(afterPull?.owned[rolled.character.id]).toBe(1)

    const five = applyOwnedDelta(emptyGachaLocalSnapshot().owned, common.id, 5)
    expect(five[common.id]).toBe(5)
    expect(remainingCopiesAfterSpend(five[common.id]!)).toBe(0)

    const map = ownedRecordToMap(five)
    expect(ownedMapToRecord(map)[common.id]).toBe(5)
  })

  it('buys a weekly featured skin for more than one pull and stacks copies', () => {
    const epic = gachaPoolByRarity('epic')[0]!
    const price = weeklyFeaturedPrice(epic)
    expect(price).toBeGreaterThan(GACHA_PULL_COST)

    const wallet = price * 3
    const first = applyWeeklyPurchase(emptyGachaLocalSnapshot(), epic.id, price, wallet)
    expect(first?.pointsSpent).toBe(price)
    expect(first?.owned[epic.id]).toBe(1)
    expect(first?.pity).toEqual(emptyGachaPity())

    const second = applyWeeklyPurchase(first!, epic.id, price, wallet - price)
    expect(second?.owned[epic.id]).toBe(2)
    expect(second?.pointsSpent).toBe(price * 2)
    expect(second?.lastResult?.isNew).toBe(false)

    expect(applyWeeklyPurchase(emptyGachaLocalSnapshot(), epic.id, price, price - 1)).toBeNull()
  })

  it('previews a roll without spending points or advancing pity', () => {
    const rolled = rollGacha(
      { pity: emptyGachaPity(), ownedIds: new Set(), forceRarity: 'legendary' },
      () => 0,
    )
    const after = applyPreviewRoll(emptyGachaLocalSnapshot(), rolled)
    expect(after.pointsSpent).toBe(0)
    expect(after.pity).toEqual(emptyGachaPity())
    expect(after.owned).toEqual(emptyGachaLocalSnapshot().owned)
    expect(after.lastResult?.rarity).toBe('legendary')
    expect(after.lastResult?.characterId).toBe(rolled.character.id)
  })

  it('exchanges five copies without leaving a 4/5 remainder', () => {
    const common = gachaPoolByRarity('common')[0]!
    const rare = gachaPoolByRarity('rare')[0]!
    const snapshot = {
      ...emptyGachaLocalSnapshot(),
      owned: { [common.id]: 5 },
    }
    const exchanged = applyExchangeToSnapshot(snapshot, common.id, {
      character: rare,
      rarity: 'rare',
      isNew: true,
      pity: snapshot.pity,
    })
    expect(exchanged?.owned[common.id]).toBeUndefined()
    expect(exchanged?.owned[rare.id]).toBe(1)
    expect(exchanged?.pointsSpent).toBe(0)
  })
})
