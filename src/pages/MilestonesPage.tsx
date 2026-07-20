import { useEffect, useState } from 'react'
import { AchievementBadges } from '../components/AchievementBadges'
import { useAuth } from '../components/AuthProvider'
import { ACHIEVEMENT_DEFINITIONS } from '../lib/achievements'
import type { AchievementAward } from '../lib/achievements'
import { fetchMyAchievements } from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { ACHIEVEMENTS_CHANGED_EVENT } from '../lib/achievementUnlocks'
import { reportSecretEvent } from '../lib/secretEvents'

/** Full progressive milestone catalog with earned / locked state. */
export function MilestonesPage() {
  const { user } = useAuth()
  const [awards, setAwards] = useState<AchievementAward[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!user) return
    void reportSecretEvent('milestones_tourist')
  }, [user])

  useEffect(() => {
    function onAchievementsChanged() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
    if (!import.meta.env.DEV) {
      return () => window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
    }
    function onDevChange() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => {
      window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
      window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    }
  }, [])

  useEffect(() => {
    if (!user && !import.meta.env.DEV) {
      setAwards([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchMyAchievements().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setAwards(result.awards)
        setError(null)
      } else {
        setAwards([])
        setError(user ? 'Could not load milestones.' : null)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user, reloadToken])

  const earnedCount = awards.length
  const totalCount = ACHIEVEMENT_DEFINITIONS.length

  return (
    <div className="milestones-page">
      <div className="milestones-page-head">
        <p className="milestones-page-kicker">Milestones</p>
        <h1 className="home-section-title">Milestones</h1>
        <p className="home-section-blurb milestones-page-blurb">
          Progressive ladders for finishes, streaks, full clears, and daily visits, plus
          Hush-Hush secrets. Each milestone also awards shop points.
        </p>
        <p className="milestones-page-progress" aria-live="polite">
          {user || import.meta.env.DEV
            ? `${earnedCount} of ${totalCount} earned`
            : `Sign in to track progress · ${totalCount} to collect`}
        </p>
      </div>

      <AchievementBadges
        awards={awards}
        loading={Boolean(user) && loading}
        error={user ? error : null}
        catalog
        groupByCategory
      />
    </div>
  )
}
