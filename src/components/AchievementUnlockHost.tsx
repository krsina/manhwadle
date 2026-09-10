import { useEffect, useState } from 'react'
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementAward,
} from '../lib/achievements'
import {
  ACHIEVEMENTS_CHANGED_EVENT,
  type AchievementsChangedDetail,
  claimFreshAchievementIds,
  consumeNewAchievementIds,
  hasHydratedAchievements,
  resetAchievementUnlockHydration,
  seedSeenAchievements,
} from '../lib/achievementUnlocks'
import { isAccountSetupComplete } from '../lib/accountSetup'
import { fetchMyAchievements } from '../lib/leaderboardApi'
import { AchievementUnlockModal } from './AchievementUnlockModal'
import { useAuth } from './AuthProvider'

function awardsFromIds(ids: string[]): AchievementAward[] {
  const now = new Date().toISOString()
  const byId = new Map(ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d]))
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is (typeof ACHIEVEMENT_DEFINITIONS)[number] => Boolean(d))
    .map((d) => ({
      id: d.id,
      version: d.version,
      title: d.title,
      description: d.description,
      category: d.category,
      awardedAt: now,
      pointReward: d.pointReward,
    }))
}

/**
 * Site-wide unlock toasts. Lives in the layout so secrets (theme toggle, shop,
 * Konami, etc.) celebrate even when the user is not on Home.
 */
export function AchievementUnlockHost() {
  const { user, account, accountLoading, needsUsername } = useAuth()
  const [unlockQueue, setUnlockQueue] = useState<AchievementAward[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const accountSetupComplete = isAccountSetupComplete(
    Boolean(user),
    accountLoading,
    account,
  )

  useEffect(() => {
    function onAchievementsChanged(event: Event) {
      const detail = (event as CustomEvent<AchievementsChangedDetail>).detail
      const awardedIds = detail?.awardedIds
      // Achievement events can arrive during sign-in sync or username setup.
      // Defer them until onboarding is complete so two modal flows never stack.
      if (accountSetupComplete && awardedIds && awardedIds.length > 0) {
        const freshIds = claimFreshAchievementIds(awardedIds)
        const fresh = awardsFromIds(freshIds)
        if (fresh.length > 0) {
          setUnlockQueue((q) => [...q, ...fresh])
        }
      }
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
    return () => window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
  }, [accountSetupComplete])

  useEffect(() => {
    if (!user) {
      resetAchievementUnlockHydration()
      setUnlockQueue([])
      return
    }
    if (!accountSetupComplete) {
      if (needsUsername) setUnlockQueue([])
      return
    }
    let cancelled = false
    void fetchMyAchievements().then((result) => {
      if (cancelled || !result.ok) return
      const ids = result.awards.map((a) => a.id)
      if (!hasHydratedAchievements()) {
        seedSeenAchievements(ids)
        return
      }
      const freshIds = consumeNewAchievementIds(ids)
      if (freshIds.length === 0) return
      const byId = new Map(result.awards.map((a) => [a.id, a]))
      const fresh = freshIds
        .map((id) => byId.get(id))
        .filter((a): a is AchievementAward => Boolean(a))
      if (fresh.length > 0) setUnlockQueue((q) => [...q, ...fresh])
    })
    return () => {
      cancelled = true
    }
  }, [user, accountSetupComplete, needsUsername, reloadToken])

  return (
    <AchievementUnlockModal
      award={unlockQueue[0] ?? null}
      onClose={() => setUnlockQueue((q) => q.slice(1))}
    />
  )
}
