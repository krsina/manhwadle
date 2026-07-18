import { useEffect, useMemo, useState } from 'react'
import { listModes } from '../modes'
import { ModeRow } from '../components/ModeRow'
import { LeaderboardPanel } from '../components/LeaderboardPanel'
import { AchievementBadges } from '../components/AchievementBadges'
import { useAuth } from '../components/AuthProvider'
import {
  fetchMyAchievements,
  fetchMyTodayModeCompletions,
  fetchPublicSiteStatus,
  type PublicSiteStatus,
} from '../lib/leaderboardApi'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { buildModeRowStatuses } from '../lib/modeCompletion'
import type { AchievementAward } from '../lib/achievements'
import type { ReaderTaste } from '../lib/readerTaste'

interface HomePageProps {
  taste: ReaderTaste | null
}

export function HomePage({ taste }: HomePageProps) {
  const { user } = useAuth()
  const [siteStatus, setSiteStatus] = useState<PublicSiteStatus | null>(null)
  const [serverModes, setServerModes] = useState<string[] | null>(null)
  const [awards, setAwards] = useState<AchievementAward[]>([])
  const [awardsLoading, setAwardsLoading] = useState(false)
  const [awardsError, setAwardsError] = useState<string | null>(null)
  const [awardsReloadToken, setAwardsReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchPublicSiteStatus().then((result) => {
      if (cancelled || !result.ok) return
      setSiteStatus(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user && !import.meta.env.DEV) {
      setServerModes(null)
      setAwards([])
      setAwardsError(null)
      return
    }
    let cancelled = false
    setAwardsLoading(true)
    void Promise.all([
      user ? fetchMyTodayModeCompletions() : Promise.resolve({ ok: false as const, error: 'guest' }),
      fetchMyAchievements(),
    ]).then(([completions, achievements]) => {
      if (cancelled) return
      if (completions.ok) setServerModes(completions.modes)
      else setServerModes(null)
      if (achievements.ok) {
        setAwards(achievements.awards)
        setAwardsError(null)
      } else {
        setAwardsError(user ? 'Could not load milestones.' : null)
      }
      setAwardsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user, awardsReloadToken])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onDevChange() {
      setAwardsReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
  }, [])

  const unavailable = useMemo(() => {
    const set = new Set<string>()
    for (const mode of siteStatus?.modes ?? []) {
      if (!mode.available) set.add(mode.mode)
    }
    return set
  }, [siteStatus])

  const modeMessages = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const mode of siteStatus?.modes ?? []) {
      map.set(mode.mode, mode.message)
    }
    return map
  }, [siteStatus])

  const statuses = useMemo(
    () =>
      buildModeRowStatuses({
        taste,
        serverModes: user ? serverModes : null,
        unavailableModes: unavailable,
      }),
    [taste, user, serverModes, unavailable],
  )

  const modes = listModes()

  return (
    <div className="home-page">
      <div className="home-main">
        <section className="home-modes" aria-labelledby="home-modes-heading">
          <div className="home-section-head">
            <h1 id="home-modes-heading" className="home-section-title">
              Today&apos;s modes
            </h1>
            <p className="home-section-blurb">
              Four daily puzzles. Pick a mode to play — preference is only asked when you
              start.
            </p>
          </div>
          <div className="mode-row-list" role="list">
            {modes.map((mode) => {
              const row = statuses.find((s) => s.modeId === mode.id)
              const available = !unavailable.has(mode.id)
              return (
                <div key={mode.id} role="listitem">
                  <ModeRow
                    mode={mode}
                    status={row?.status ?? 'not_started'}
                    available={available}
                    unavailableMessage={modeMessages.get(mode.id)}
                  />
                </div>
              )
            })}
          </div>
        </section>

        <LeaderboardPanel />
      </div>

      <section className="home-achievements" aria-labelledby="home-achievements-heading">
        <h2 id="home-achievements-heading" className="home-section-title">
          Milestones
        </h2>
        <p className="home-section-blurb">
          Little trophies for sticking with the daily grind.
        </p>
          <AchievementBadges
            awards={awards}
            loading={Boolean(user) && awardsLoading}
            error={user ? awardsError : null}
            emptyLabel={
              user
                ? 'No milestones yet — finish today’s puzzles to start collecting.'
                : 'Sign in to track verified milestones across devices.'
            }
          />
      </section>
    </div>
  )
}
