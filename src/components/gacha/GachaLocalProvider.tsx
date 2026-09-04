import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { equipAvatar } from '../../lib/avatarShop'
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
  readGachaPrefs,
  rollFromLastResult,
  writeGachaLocalSnapshot,
  writeGachaPrefs,
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
  buyGachaWeekly,
  clientWeeklyFeatured,
  exchangeGachaCopies,
  fetchGachaState,
  gachaErrorMessage,
  guestGachaState,
  pullGacha,
  type GachaFeaturedRow,
  type GachaStateSnapshot,
} from '../../lib/gachaApi'
import {
  GACHA_PULL_COST,
  isWeeklyFeaturedId,
  weeklyFeaturedPrice,
} from '../../lib/gachaWeekly'
import { getAvatarCharacterMeta, type AvatarCharacterMeta } from '../../lib/avatarComposition'

type GachaPlayResult =
  | { ok: true; rolled: GachaRollResult }
  | { ok: false; error: string }

interface GachaLocalContextValue {
  snapshot: GachaLocalSnapshot
  points: number
  owned: Map<string, number>
  lastResult: GachaRollResult | null
  featured: GachaFeaturedRow[]
  error: string | null
  pull: () => Promise<GachaPlayResult>
  preview: (rarity?: GachaRarity | null) => GachaRollResult
  buyWeekly: (characterId: string, now?: Date) => Promise<GachaPlayResult>
  exchange: (character: AvatarCharacterMeta) => Promise<GachaPlayResult>
  equip: (characterId: string) => Promise<boolean>
  grantLatest: () => boolean
  reset: () => void
  setForceRarity: (rarity: GachaRarity | null) => void
  setSkip: (skip: boolean) => void
  setMuted: (muted: boolean) => void
}

const GachaLocalContext = createContext<GachaLocalContextValue | null>(null)

function snapshotFromServer(
  state: GachaStateSnapshot,
  prefs: { skip: boolean; muted: boolean },
): GachaLocalSnapshot {
  return {
    pointsSpent: 0,
    pity: state.pity,
    owned: state.owned,
    equippedAvatarId: state.equippedAvatarId,
    forceRarity: null,
    skip: prefs.skip,
    muted: prefs.muted,
    lastResult: state.lastResult,
  }
}

function GachaLocalSession({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  const [snapshot, setSnapshot] = useState<GachaLocalSnapshot>(readGachaLocalSnapshot)
  const points = gachaAvailablePoints(account?.pointsBalance ?? 0, snapshot.pointsSpent)
  const featured = useMemo(() => clientWeeklyFeatured(), [])

  useEffect(() => {
    writeGachaLocalSnapshot(snapshot)
  }, [snapshot])

  const pull = useCallback(async (): Promise<GachaPlayResult> => {
    if (points < GACHA_PULL_COST) {
      return { ok: false, error: gachaErrorMessage('insufficient_points') }
    }
    const rolled = rollGacha({
      pity: snapshot.pity,
      ownedIds: new Set(Object.keys(snapshot.owned)),
      forceRarity: snapshot.forceRarity,
    })
    const next = applyGachaPull(snapshot, rolled, points)
    if (!next) return { ok: false, error: gachaErrorMessage('insufficient_points') }
    setSnapshot(next)
    return { ok: true, rolled }
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
    async (characterId: string, now = new Date()): Promise<GachaPlayResult> => {
      if (!isWeeklyFeaturedId(characterId, now)) {
        return { ok: false, error: gachaErrorMessage('not_featured') }
      }
      const character = getAvatarCharacterMeta(characterId)
      if (!character) return { ok: false, error: gachaErrorMessage('not_found') }
      const price = weeklyFeaturedPrice(character)
      const next = applyWeeklyPurchase(snapshot, characterId, price, points)
      if (!next) return { ok: false, error: gachaErrorMessage('insufficient_points') }
      setSnapshot(next)
      const rolled = rollFromLastResult(next.lastResult, next.pity)
      if (!rolled) return { ok: false, error: gachaErrorMessage('unexpected') }
      return { ok: true, rolled }
    },
    [points, snapshot],
  )

  const exchange = useCallback(
    async (character: AvatarCharacterMeta): Promise<GachaPlayResult> => {
      const rolled = rollGachaUpgrade({
        character,
        ownedIds: new Set(Object.keys(snapshot.owned)),
        pity: snapshot.pity,
      })
      if (!rolled) return { ok: false, error: gachaErrorMessage('not_enough_copies') }
      const next = applyExchangeToSnapshot(snapshot, character.id, rolled)
      if (!next) return { ok: false, error: gachaErrorMessage('not_enough_copies') }
      setSnapshot(next)
      return { ok: true, rolled }
    },
    [snapshot],
  )

  const equip = useCallback(
    async (characterId: string) => {
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
      featured,
      error: null,
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
      featured,
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

function GachaServerSession({ children }: { children: ReactNode }) {
  const { user, account, refreshAccount } = useAuth()
  const [snapshot, setSnapshot] = useState<GachaLocalSnapshot>(() => {
    const prefs = readGachaPrefs()
    return {
      ...emptyGachaLocalSnapshot(),
      skip: prefs.skip,
      muted: prefs.muted,
    }
  })
  const [points, setPoints] = useState(0)
  const [featured, setFeatured] = useState<GachaFeaturedRow[]>(clientWeeklyFeatured)
  const [error, setError] = useState<string | null>(null)

  const applyServerState = useCallback((state: GachaStateSnapshot) => {
    setPoints(state.balance)
    setFeatured(state.featured.length > 0 ? state.featured : clientWeeklyFeatured())
    setSnapshot((current) => snapshotFromServer(state, { skip: current.skip, muted: current.muted }))
  }, [])

  useEffect(() => {
    writeGachaPrefs({ skip: snapshot.skip, muted: snapshot.muted })
  }, [snapshot.skip, snapshot.muted])

  useEffect(() => {
    let cancelled = false
    void fetchGachaState().then((result) => {
      if (cancelled) return
      applyServerState(result.ok ? result.state : guestGachaState())
    })
    return () => {
      cancelled = true
    }
  }, [applyServerState, user?.id, account?.pointsBalance])

  const pull = useCallback(async (): Promise<GachaPlayResult> => {
    const result = await pullGacha()
    if (!result.ok) {
      setError(result.error)
      return result
    }
    setError(null)
    applyServerState(result.state)
    void refreshAccount()
    return { ok: true, rolled: result.rolled }
  }, [applyServerState, refreshAccount])

  const preview = useCallback(
    (rarity?: GachaRarity | null): GachaRollResult =>
      rollGacha({
        pity: snapshot.pity,
        ownedIds: new Set(Object.keys(snapshot.owned)),
        forceRarity: rarity === undefined ? snapshot.forceRarity : rarity,
      }),
    [snapshot],
  )

  const buyWeekly = useCallback(
    async (characterId: string): Promise<GachaPlayResult> => {
      const result = await buyGachaWeekly(characterId)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      applyServerState(result.state)
      void refreshAccount()
      return { ok: true, rolled: result.rolled }
    },
    [applyServerState, refreshAccount],
  )

  const exchange = useCallback(
    async (character: AvatarCharacterMeta): Promise<GachaPlayResult> => {
      const result = await exchangeGachaCopies(character.id)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      applyServerState(result.state)
      void refreshAccount()
      return { ok: true, rolled: result.rolled }
    },
    [applyServerState, refreshAccount],
  )

  const equip = useCallback(
    async (characterId: string) => {
      if ((snapshot.owned[characterId] ?? 0) < 1) return false
      if (!user) {
        setSnapshot((current) => ({ ...current, equippedAvatarId: characterId }))
        return true
      }
      const result = await equipAvatar(characterId)
      if (!result.ok) {
        setError(result.error)
        return false
      }
      setError(null)
      setSnapshot((current) => ({
        ...current,
        equippedAvatarId: result.equippedAvatarId ?? characterId,
      }))
      void refreshAccount()
      return true
    },
    [refreshAccount, snapshot.owned, user],
  )

  const grantLatest = useCallback(() => false, [])
  const reset = useCallback(() => undefined, [])
  const setForceRarity = useCallback((_rarity: GachaRarity | null) => {
    /* Lab-only; production rolls are server-authoritative. */
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
      featured,
      error,
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
      featured,
      error,
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
  if (isLocalGachaShop()) return <GachaLocalSession>{children}</GachaLocalSession>
  return <GachaServerSession>{children}</GachaServerSession>
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
