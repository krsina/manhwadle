import { getAvatarCharacterMeta } from './avatarComposition'
import {
  applyGachaCopySpend,
  emptyGachaPity,
  isGachaRarity,
  starterOwnedIds,
  toGachaRarity,
  type GachaPityState,
  type GachaRarity,
  type GachaRollResult,
} from './gacha'
import { GACHA_PULL_COST } from './gachaWeekly'

export const GACHA_LOCAL_STORAGE_KEY = 'manhwadle:gacha-shop-local'

export interface GachaLocalLastResult {
  characterId: string
  rarity: GachaRarity
  isNew: boolean
}

export interface GachaLocalSnapshot {
  pointsSpent: number
  pity: GachaPityState
  owned: Record<string, number>
  equippedAvatarId: string | null
  forceRarity: GachaRarity | null
  skip: boolean
  muted: boolean
  lastResult: GachaLocalLastResult | null
}

export function isLocalGachaShop(): boolean {
  return import.meta.env.DEV
}

export function gachaAvailablePoints(serverBalance: number, pointsSpent: number): number {
  return Math.max(0, Math.floor(serverBalance) - Math.max(0, Math.floor(pointsSpent)))
}

export function emptyGachaLocalSnapshot(): GachaLocalSnapshot {
  const owned: Record<string, number> = {}
  for (const id of starterOwnedIds()) owned[id] = 1
  return {
    pointsSpent: 0,
    pity: emptyGachaPity(),
    owned,
    equippedAvatarId: null,
    forceRarity: null,
    skip: false,
    muted: false,
    lastResult: null,
  }
}

function asFiniteInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function parseOwned(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const owned: Record<string, number> = {}
    for (const id of starterOwnedIds()) owned[id] = 1
    return owned
  }

  const owned: Record<string, number> = {}
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!getAvatarCharacterMeta(id)) continue
    const copies = asFiniteInt(count, 0)
    if (copies > 0) owned[id] = copies
  }
  if (Object.keys(owned).length === 0) {
    for (const id of starterOwnedIds()) owned[id] = 1
  }
  return owned
}

function parsePity(raw: unknown): GachaPityState {
  if (!raw || typeof raw !== 'object') return emptyGachaPity()
  const row = raw as Record<string, unknown>
  return {
    pullCount: asFiniteInt(row.pullCount, 0),
    pullsSinceRarePlus: asFiniteInt(row.pullsSinceRarePlus, 0),
  }
}

function parseLastResult(raw: unknown): GachaLocalLastResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.characterId !== 'string' || !getAvatarCharacterMeta(row.characterId)) return null
  if (typeof row.rarity !== 'string' || !isGachaRarity(row.rarity)) return null
  return {
    characterId: row.characterId,
    rarity: row.rarity,
    isNew: row.isNew === true,
  }
}

export function parseGachaLocalSnapshot(raw: unknown): GachaLocalSnapshot {
  const empty = emptyGachaLocalSnapshot()
  if (!raw || typeof raw !== 'object') return empty
  const row = raw as Record<string, unknown>
  const equipped =
    typeof row.equippedAvatarId === 'string' && getAvatarCharacterMeta(row.equippedAvatarId)
      ? row.equippedAvatarId
      : empty.equippedAvatarId
  const forceRarity =
    typeof row.forceRarity === 'string' && isGachaRarity(row.forceRarity) ? row.forceRarity : null

  return {
    pointsSpent: asFiniteInt(row.pointsSpent, empty.pointsSpent),
    pity: parsePity(row.pity),
    owned: parseOwned(row.owned),
    equippedAvatarId: equipped,
    forceRarity,
    skip: row.skip === true,
    muted: row.muted === true,
    lastResult: parseLastResult(row.lastResult),
  }
}

export function serializeGachaLocalSnapshot(snapshot: GachaLocalSnapshot): string {
  return JSON.stringify(snapshot)
}

export function readGachaLocalSnapshot(): GachaLocalSnapshot {
  if (typeof localStorage === 'undefined') return emptyGachaLocalSnapshot()
  try {
    const raw = localStorage.getItem(GACHA_LOCAL_STORAGE_KEY)
    if (!raw) return emptyGachaLocalSnapshot()
    return parseGachaLocalSnapshot(JSON.parse(raw) as unknown)
  } catch {
    return emptyGachaLocalSnapshot()
  }
}

export function writeGachaLocalSnapshot(snapshot: GachaLocalSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GACHA_LOCAL_STORAGE_KEY, serializeGachaLocalSnapshot(snapshot))
  } catch {
    /* storage full or unserializable: the local shop stays in-memory */
  }
}

export function ownedRecordToMap(owned: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(owned).filter(([, count]) => count > 0))
}

export function ownedMapToRecord(owned: ReadonlyMap<string, number>): Record<string, number> {
  const record: Record<string, number> = {}
  for (const [id, count] of owned) {
    if (count > 0) record[id] = count
  }
  return record
}

export function lastResultFromRoll(result: GachaRollResult): GachaLocalLastResult {
  return {
    characterId: result.character.id,
    rarity: result.rarity,
    isNew: result.isNew,
  }
}

export function rollFromLastResult(
  last: GachaLocalLastResult | null,
  pity: GachaPityState,
): GachaRollResult | null {
  if (!last) return null
  const character = getAvatarCharacterMeta(last.characterId)
  if (!character) return null
  return {
    character,
    rarity: last.rarity,
    isNew: last.isNew,
    pity,
  }
}

export function applyOwnedDelta(
  owned: Record<string, number>,
  characterId: string,
  delta: number,
): Record<string, number> {
  const next = { ...owned }
  const copies = (next[characterId] ?? 0) + delta
  if (copies <= 0) delete next[characterId]
  else next[characterId] = copies
  return next
}

export function applyGachaPull(
  snapshot: GachaLocalSnapshot,
  result: GachaRollResult,
  availablePoints: number,
  cost = GACHA_PULL_COST,
): GachaLocalSnapshot | null {
  if (availablePoints < cost) return null
  return {
    ...snapshot,
    pointsSpent: snapshot.pointsSpent + cost,
    pity: result.pity,
    owned: applyOwnedDelta(snapshot.owned, result.character.id, 1),
    lastResult: lastResultFromRoll(result),
  }
}

/** Local lab preview: play a roll without spending points, pity, or copies. */
export function applyPreviewRoll(
  snapshot: GachaLocalSnapshot,
  result: GachaRollResult,
): GachaLocalSnapshot {
  return {
    ...snapshot,
    lastResult: lastResultFromRoll(result),
  }
}

export function applyExchangeToSnapshot(
  snapshot: GachaLocalSnapshot,
  sourceId: string,
  result: GachaRollResult,
): GachaLocalSnapshot | null {
  const nextOwned = applyGachaCopySpend(
    ownedRecordToMap(snapshot.owned),
    sourceId,
    result.character.id,
  )
  if (!nextOwned) return null
  const equippedAvatarId =
    snapshot.equippedAvatarId && nextOwned.has(snapshot.equippedAvatarId)
      ? snapshot.equippedAvatarId
      : null
  return {
    ...snapshot,
    owned: ownedMapToRecord(nextOwned),
    lastResult: lastResultFromRoll(result),
    equippedAvatarId,
  }
}

export function applyGrantCopies(
  snapshot: GachaLocalSnapshot,
  characterId: string,
  amount: number,
): GachaLocalSnapshot | null {
  if (amount < 1 || !getAvatarCharacterMeta(characterId)) return null
  return {
    ...snapshot,
    owned: applyOwnedDelta(snapshot.owned, characterId, amount),
  }
}

export function applyEquipAvatar(
  snapshot: GachaLocalSnapshot,
  characterId: string,
): GachaLocalSnapshot | null {
  if ((snapshot.owned[characterId] ?? 0) < 1) return null
  return { ...snapshot, equippedAvatarId: characterId }
}

export function applyWeeklyPurchase(
  snapshot: GachaLocalSnapshot,
  characterId: string,
  price: number,
  availablePoints: number,
): GachaLocalSnapshot | null {
  if (price < 1 || availablePoints < price) return null
  const character = getAvatarCharacterMeta(characterId)
  if (!character) return null
  const alreadyOwned = (snapshot.owned[characterId] ?? 0) > 0
  return {
    ...snapshot,
    pointsSpent: snapshot.pointsSpent + price,
    owned: applyOwnedDelta(snapshot.owned, characterId, 1),
    lastResult: {
      characterId,
      rarity: toGachaRarity(character.rarity),
      isNew: !alreadyOwned,
    },
  }
}
