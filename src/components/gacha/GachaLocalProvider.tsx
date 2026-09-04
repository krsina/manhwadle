import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyEquipAvatar,
  applyExchangeToSnapshot,
  applyGachaPull,
  applyGrantCopies,
  applyPreviewRoll,
  applyWeeklyPurchase,
  emptyGachaLocalSnapshot,
  gachaAvailablePoints,
  isLocalGachaShop,
  ownedRecordToMap,
  readGachaLocalSnapshot,
  rollFromLastResult,
  writeGachaLocalSnapshot,
  type GachaLocalSnapshot,
} from '../../lib/gachaLocalStore'
import { useAuth } from '../AuthProvider'
import {
  GACHA_UPGRADE_DUPLICATES,
  rollGacha,
  rollGachaUpgrade,
  type GachaRarity,
  type GachaRollResult,
} from '../../lib/gacha'
import {
  GACHA_PULL_COST,
  isWeeklyFeaturedId,
  weeklyFeaturedPrice,
} from '../../lib/gachaWeekly'
import { getAvatarCharacterMeta, type AvatarCharacterMeta } from '../../lib/avatarComposition'

interface GachaLocalContextValue {
  snapshot: GachaLocalSnapshot
  points: number
  owned: Map<string, number>
  lastResult: GachaRollResult | null
  pull: () => GachaRollResult | null
  preview: (rarity?: GachaRarity | null) => GachaRollResult
  buyWeekly: (characterId: string, now?: Date) => GachaRollResult | null
  exchange: (character: AvatarCharacterMeta) => GachaRollResult | null
  equip: (characterId: string) => boolean
  grantLatest: () => boolean
  reset: () => void
  setForceRarity: (rarity: GachaRarity | null) => void
  setSkip: (skip: boolean) => void
  setMuted: (muted: boolean) => void
}

const GachaLocalContext = createContext<GachaLocalContextValue | null>(null)

function GachaLocalSession({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  const [snapshot, setSnapshot] = useState<GachaLocalSnapshot>(readGachaLocalSnapshot)
  const points = gachaAvailablePoints(account?.pointsBalance ?? 0, snapshot.pointsSpent)

  useEffect(() => {
    writeGachaLocalSnapshot(snapshot)
  }, [snapshot])

  const pull = useCallback((): GachaRollResult | null => {
    if (points < GACHA_PULL_COST) return null
    const rolled = rollGacha({
      pity: snapshot.pity,
      ownedIds: new Set(Object.keys(snapshot.owned)),
      forceRarity: snapshot.forceRarity,
    })
    const next = applyGachaPull(snapshot, rolled, points)
    if (!next) return null
    setSnapshot(next)
    return rolled
  }, [points, snapshot])

  const preview = useCallback(
    (rarity?: GachaRarity | null): GachaRollResult => {
      const rolled = rollGacha({
        pity: snapshot.pity,
        ownedIds: new Set(Object.keys(snapshot.owned)),
        forceRarity: rarity === undefined ? snapshot.forceRarity : rarity,
      })
      setSnapshot((current) => applyPreviewRoll(current, rolled))
      return rolled
    },
    [snapshot],
  )

  const buyWeekly = useCallback(
    (characterId: string, now = new Date()): GachaRollResult | null => {
      if (!isWeeklyFeaturedId(characterId, now)) return null
      const character = getAvatarCharacterMeta(characterId)
      if (!character) return null
      const price = weeklyFeaturedPrice(character)
      const next = applyWeeklyPurchase(snapshot, characterId, price, points)
      if (!next) return null
      setSnapshot(next)
      return rollFromLastResult(next.lastResult, next.pity)
    },
    [points, snapshot],
  )

  const exchange = useCallback(
    (character: AvatarCharacterMeta): GachaRollResult | null => {
      const rolled = rollGachaUpgrade({
        character,
        ownedIds: new Set(Object.keys(snapshot.owned)),
        pity: snapshot.pity,
      })
      if (!rolled) return null
      const next = applyExchangeToSnapshot(snapshot, character.id, rolled)
      if (!next) return null
      setSnapshot(next)
      return rolled
    },
    [snapshot],
  )

  const equip = useCallback(
    (characterId: string) => {
      const next = applyEquipAvatar(snapshot, characterId)
      if (!next) return false
      setSnapshot(next)
      return true
    },
    [snapshot],
  )

  const grantLatest = useCallback(() => {
    const characterId = snapshot.lastResult?.characterId
    if (!characterId) return false
    const next = applyGrantCopies(snapshot, characterId, GACHA_UPGRADE_DUPLICATES)
    if (!next) return false
    setSnapshot(next)
    return true
  }, [snapshot])

  const reset = useCallback(() => {
    setSnapshot(emptyGachaLocalSnapshot())
  }, [])

  const setForceRarity = useCallback((rarity: GachaRarity | null) => {
    setSnapshot((current) => ({ ...current, forceRarity: rarity }))
  }, [])

  const setSkip = useCallback((skip: boolean) => {
    setSnapshot((current) => ({ ...current, skip }))
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    setSnapshot((current) => ({ ...current, muted }))
  }, [])

  const value = useMemo<GachaLocalContextValue>(
    () => ({
      snapshot,
      points,
      owned: ownedRecordToMap(snapshot.owned),
      lastResult: rollFromLastResult(snapshot.lastResult, snapshot.pity),
      pull,
      preview,
      buyWeekly,
      exchange,
      equip,
      grantLatest,
      reset,
      setForceRarity,
      setSkip,
      setMuted,
    }),
    [
      snapshot,
      points,
      pull,
      preview,
      buyWeekly,
      exchange,
      equip,
      grantLatest,
      reset,
      setForceRarity,
      setSkip,
      setMuted,
    ],
  )

  return <GachaLocalContext.Provider value={value}>{children}</GachaLocalContext.Provider>
}

export function GachaLocalProvider({ children }: { children: ReactNode }) {
  if (!isLocalGachaShop()) return children
  return <GachaLocalSession>{children}</GachaLocalSession>
}

export function useGachaLocal(): GachaLocalContextValue {
  const value = useContext(GachaLocalContext)
  if (!value) {
    throw new Error('useGachaLocal requires GachaLocalProvider')
  }
  return value
}

export function useOptionalGachaLocal(): GachaLocalContextValue | null {
  return useContext(GachaLocalContext)
}
