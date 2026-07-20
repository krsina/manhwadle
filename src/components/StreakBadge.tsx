import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { fetchMyLeaderboardStanding } from '../lib/leaderboardApi'
import {
  DEV_LEADERBOARD_EVENT,
  isDevLeaderboardOverrideEnabled,
} from '../lib/leaderboardDevFake'
import { streakTier } from '../lib/streakIntensity'

/** Current any-mode streak shown in the site header. */
export function StreakBadge() {
  const { user, configured } = useAuth()
  const [streak, setStreak] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    function onDevChange() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    const useDev = import.meta.env.DEV && isDevLeaderboardOverrideEnabled()
    if (!useDev && (!configured || !user)) {
      setStreak(null)
      return
    }
    void fetchMyLeaderboardStanding().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setStreak(useDev ? 0 : null)
        return
      }
      setStreak(result.standing.anyCurrentStreak)
    })
    return () => {
      cancelled = true
    }
  }, [user, configured, reloadToken])

  if (streak == null) return null

  const tier = streakTier(streak)

  return (
    <span
      className={`streak-badge streak-tier-${tier}`}
      data-streak={streak}
      title={`Current streak: ${streak} day${streak === 1 ? '' : 's'}`}
      aria-label={`Current streak ${streak} day${streak === 1 ? '' : 's'}`}
    >
      <span className="streak-badge-fire" aria-hidden="true">
        <span className="streak-badge-emoji">🔥</span>
        <span className="streak-badge-glow" />
        <span className="streak-badge-sparks" />
      </span>
      <span className="streak-badge-value">{streak}</span>
    </span>
  )
}
