import {
  AVATAR_CHARACTER_META,
  starterAvatarIds,
  type AvatarCharacterMeta,
  type AvatarRarity,
} from './avatarComposition'

export type GachaRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type GachaRng = () => number

/** Common-weighted banner. Legendary stays 1%. */
export const GACHA_RATES: Record<GachaRarity, number> = {
  common: 0.45,
  rare: 0.34,
  epic: 0.2,
  legendary: 0.01,
}

/** Commons in a row before the next pull is at least rare. */
export const GACHA_SOFT_PITY = 9

/** Every Nth pull is epic. */
export const GACHA_HARD_PITY = 40

/** Owned copies of the same character required to reroll into the next rarity. */
export const GACHA_UPGRADE_DUPLICATES = 5

const GACHA_BANDS: readonly GachaRarity[] = ['common', 'rare', 'epic', 'legendary']
const FALLBACK_BANDS: readonly GachaRarity[] = ['legendary', 'epic', 'rare', 'common']

export interface GachaPityState {
  pullCount: number
  pullsSinceRarePlus: number
}

export interface GachaRollInput {
  pity: GachaPityState
  ownedIds: ReadonlySet<string>
  forceRarity?: GachaRarity | null
}

export interface GachaRollResult {
  character: AvatarCharacterMeta
  rarity: GachaRarity
  isNew: boolean
  pity: GachaPityState
}

export interface GachaUpgradeInput {
  character: AvatarCharacterMeta
  ownedIds: ReadonlySet<string>
  pity: GachaPityState
}

export function emptyGachaPity(): GachaPityState {
  return { pullCount: 0, pullsSinceRarePlus: 0 }
}

export function gachaPityCountdown(pity: GachaPityState): {
  untilRarePlus: number
  untilEpic: number
} {
  const remainder = pity.pullCount % GACHA_HARD_PITY
  return {
    untilRarePlus: Math.max(0, GACHA_SOFT_PITY - pity.pullsSinceRarePlus),
    untilEpic: remainder === 0 ? GACHA_HARD_PITY : GACHA_HARD_PITY - remainder,
  }
}

export function starterOwnedIds(): Set<string> {
  return new Set(starterAvatarIds())
}

export function isGachaRarity(value: string): value is GachaRarity {
  return value === 'common' || value === 'rare' || value === 'epic' || value === 'legendary'
}

export function toGachaRarity(rarity: AvatarRarity): GachaRarity {
  if (rarity === 'legendary') return 'legendary'
  if (rarity === 'epic') return 'epic'
  if (rarity === 'rare') return 'rare'
  return 'common'
}

export function nextGachaRarity(rarity: GachaRarity): GachaRarity | null {
  if (rarity === 'common') return 'rare'
  if (rarity === 'rare') return 'epic'
  if (rarity === 'epic') return 'legendary'
  return null
}

/** Target band for a 5-copy exchange: next tier, or same rarity at the top. */
export function gachaExchangeTargetRarity(rarity: GachaRarity): GachaRarity {
  return nextGachaRarity(rarity) ?? rarity
}

export function gachaDuplicateCount(totalCopies: number): number {
  return Math.max(0, totalCopies - 1)
}

export function canSpendGachaCopies(totalCopies: number): boolean {
  return totalCopies >= GACHA_UPGRADE_DUPLICATES
}

export function remainingCopiesAfterSpend(totalCopies: number): number {
  return Math.max(0, totalCopies - GACHA_UPGRADE_DUPLICATES)
}

export function applyGachaCopySpend(
  owned: ReadonlyMap<string, number>,
  sourceId: string,
  rewardId: string,
): Map<string, number> | null {
  const total = owned.get(sourceId) ?? 0
  if (!canSpendGachaCopies(total)) return null

  const next = new Map(owned)
  const remaining = remainingCopiesAfterSpend(total)
  if (remaining === 0) next.delete(sourceId)
  else next.set(sourceId, remaining)
  next.set(rewardId, (next.get(rewardId) ?? 0) + 1)
  return next
}

export function gachaPool(): AvatarCharacterMeta[] {
  return AVATAR_CHARACTER_META.filter((character) => !character.starter)
}

export function gachaPoolByRarity(rarity: GachaRarity): AvatarCharacterMeta[] {
  return gachaPool().filter((character) => toGachaRarity(character.rarity) === rarity)
}

function unitInterval(rng: GachaRng): number {
  const value = rng()
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 0.999999999999
  return value
}

function pickFrom(pool: readonly AvatarCharacterMeta[], rng: GachaRng): AvatarCharacterMeta {
  const index = Math.min(pool.length - 1, Math.floor(unitInterval(rng) * pool.length))
  return pool[index]!
}

function poolFor(rarity: GachaRarity): AvatarCharacterMeta[] {
  const exact = gachaPoolByRarity(rarity)
  if (exact.length > 0) return exact
  for (const band of FALLBACK_BANDS) {
    const fallback = gachaPoolByRarity(band)
    if (fallback.length > 0) return fallback
  }
  return gachaPool()
}

/** Characters used for a spin of this band; falls back if that band has no plates yet. */
export function gachaSpinPool(rarity: GachaRarity): AvatarCharacterMeta[] {
  return poolFor(rarity)
}

function rollBand(rng: GachaRng): GachaRarity {
  const roll = unitInterval(rng)
  let cumulative = 0
  for (const band of GACHA_BANDS) {
    cumulative += GACHA_RATES[band]
    if (roll < cumulative) return band
  }
  return 'legendary'
}

function isRarePlus(rarity: GachaRarity): boolean {
  return rarity === 'rare' || rarity === 'epic' || rarity === 'legendary'
}

export function rollGacha(input: GachaRollInput, rng: GachaRng = Math.random): GachaRollResult {
  const nextCount = input.pity.pullCount + 1
  let intended: GachaRarity

  if (input.forceRarity) {
    intended = input.forceRarity
  } else if (nextCount % GACHA_HARD_PITY === 0) {
    intended = 'epic'
  } else {
    intended = rollBand(rng)
    if (input.pity.pullsSinceRarePlus >= GACHA_SOFT_PITY && intended === 'common') {
      intended = 'rare'
    }
  }

  const character = pickFrom(poolFor(intended), rng)

  return {
    character,
    rarity: intended,
    isNew: !input.ownedIds.has(character.id),
    pity: {
      pullCount: nextCount,
      pullsSinceRarePlus: isRarePlus(intended) ? 0 : input.pity.pullsSinceRarePlus + 1,
    },
  }
}

/**
 * Spends duplicate copies for a new roll: one tier higher, or same rarity at max.
 * If the next-tier pool is empty (e.g. no legendaries yet), falls back to same-rarity.
 * Exchange rolls do not spend points or advance pity.
 */
export function rollGachaUpgrade(
  input: GachaUpgradeInput,
  rng: GachaRng = Math.random,
): GachaRollResult | null {
  const sourceRarity = toGachaRarity(input.character.rarity)
  let targetRarity = gachaExchangeTargetRarity(sourceRarity)
  let sameRarityReroll = targetRarity === sourceRarity
  let targetPool = gachaPoolByRarity(targetRarity).filter((character) =>
    sameRarityReroll ? character.id !== input.character.id : true,
  )
  if (targetPool.length === 0 && targetRarity !== sourceRarity) {
    targetRarity = sourceRarity
    sameRarityReroll = true
    targetPool = gachaPoolByRarity(targetRarity).filter(
      (character) => character.id !== input.character.id,
    )
  }
  if (targetPool.length === 0) return null
  const character = pickFrom(targetPool, rng)
  return {
    character,
    rarity: toGachaRarity(character.rarity),
    isNew: !input.ownedIds.has(character.id),
    pity: input.pity,
  }
}
