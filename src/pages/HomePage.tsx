import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArchiveButton,
  ArchiveCalendarModal,
} from '../components/ArchiveCalendarModal'
import { ReaderTastePrompt } from '../components/ReaderTastePrompt'
import { listModes, resolveActiveMode } from '../modes'
import { ModeRow, VersusModeRow } from '../components/ModeRow'
import { LeaderboardPanel } from '../components/LeaderboardPanel'
import { CharacterPanel } from '../components/CharacterPanel'
import { HomeNewsPanel } from '../components/HomeNewsPanel'
import { AchievementBadges } from '../components/AchievementBadges'
import { AchievementTestLauncher } from '../components/AchievementTestModal'
import { SolveSoundTestLauncher } from '../components/SolveSoundTestModal'
import { AchievementUnlockModal } from '../components/AchievementUnlockModal'
import { useAuth } from '../components/AuthProvider'
import {
  fetchMyAchievements,
  fetchMyTodayModeCompletions,
  fetchPublicSiteStatus,
  type PublicSiteStatus,
} from '../lib/leaderboardApi'
import { ACHIEVEMENTS_CHANGED_EVENT } from '../lib/achievementUnlocks'
import { DEV_LEADERBOARD_EVENT } from '../lib/leaderboardDevFake'
import { getTodayKey } from '../lib/daily'
import { buildModeRowStatuses } from '../lib/modeCompletion'
import type { AchievementAward } from '../lib/achievements'
import { saveReaderTaste, type ReaderTaste } from '../lib/readerTaste'
import { isAccountSetupComplete } from '../lib/accountSetup'
import { MILESTONES_PATH, playPath } from '../lib/routes'
import { createHomeIdleTracker, reportSecretEvent } from '../lib/secretEvents'
import { syncAfterLocalChange } from '../lib/sync'
import { useMatchMedia } from '../hooks/useMatchMedia'

/** Matches `.home-side` stacking — fewer milestone tiles when space is tight. */
const HOME_MOBILE_MQ = '(max-width: 720px)'
const HOME_MILESTONES_DESKTOP = 12
const HOME_MILESTONES_MOBILE = 6

interface HomePageProps {
  taste: ReaderTaste | null
  setTaste: (taste: ReaderTaste) => void
}

export function HomePage({ taste, setTaste }: HomePageProps) {
  const { user, account, accountLoading } = useAuth()
  const accountSetupComplete = isAccountSetupComplete(
    Boolean(user),
    accountLoading,
    account,
  )
  const navigate = useNavigate()
  const compactHome = useMatchMedia(HOME_MOBILE_MQ)
  const [siteStatus, setSiteStatus] = useState<PublicSiteStatus | null>(null)
  const [serverModes, setServerModes] = useState<string[] | null>(null)
  const [awards, setAwards] = useState<AchievementAward[]>([])
  const [awardsLoading, setAwardsLoading] = useState(false)
  const [awardsError, setAwardsError] = useState<string | null>(null)
  const [awardsReloadToken, setAwardsReloadToken] = useState(0)
  const [testPreview, setTestPreview] = useState<AchievementAward | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [archiveAfterTaste, setArchiveAfterTaste] = useState(false)
  const todayKey = getTodayKey()
  const homeMilestonesLimit = compactHome
    ? HOME_MILESTONES_MOBILE
    : HOME_MILESTONES_DESKTOP

  function requestArchive() {
    if (!taste) {
      setArchiveAfterTaste(true)
      return
    }
    setShowArchive(true)
  }

  function handleTasteSelect(next: ReaderTaste) {
    saveReaderTaste(next)
    setTaste(next)
    syncAfterLocalChange(user?.id).taste(next)
  }

  useEffect(() => {
    if (!taste || !archiveAfterTaste) return
    setArchiveAfterTaste(false)
    setShowArchive(true)
  }, [taste, archiveAfterTaste])

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
    function onAchievementsChanged() {
      setAwardsReloadToken((n) => n + 1)
    }
    window.addEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
    if (!import.meta.env.DEV) {
      return () => window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
    }
    function onDevChange() {
      setAwardsReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    return () => {
      window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onAchievementsChanged)
      window.removeEventListener(DEV_LEADERBOARD_EVENT, onDevChange)
    }
  }, [])

  // Hush-Hush: home-only secret listeners (idle dwell + refresh ritual).
  // Konami is registered site-wide in AppLayout.
  useEffect(() => {
    if (!accountSetupComplete) return
    void reportSecretEvent('home_refresh')

    const stopIdle = createHomeIdleTracker(() => {
      void reportSecretEvent('idle_home')
    })

    return () => {
      stopIdle()
    }
  }, [accountSetupComplete])

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
            <div className="home-section-blurb-row">
              <p className="home-section-blurb">
                Four daily puzzles plus live Versus.
              </p>
              <ArchiveButton onClick={requestArchive} label="Archive" />
            </div>
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
            <div role="listitem">
              <VersusModeRow />
            </div>
          </div>
        </section>

        <aside className="home-side" aria-label="Character and rankings">
          <CharacterPanel />
          <LeaderboardPanel />
        </aside>
      </div>

      <div className="home-lower">
        <section className="home-achievements" aria-labelledby="home-achievements-heading">
          <div className="home-achievements-head">
            <div>
              <h2 id="home-achievements-heading" className="home-section-title">
                Milestones
              </h2>
              <p className="home-section-blurb">
                {!user
                  ? 'Sign up to unlock these medals and keep them across devices.'
                  : awards.length > 0
                    ? 'Your earned medals so far.'
                    : 'Little medals for sticking with the daily grind.'}
              </p>
            </div>
            <div className="home-achievements-actions">
              <Link to={MILESTONES_PATH} className="home-section-all">
                All milestones
              </Link>
              <AchievementTestLauncher onPreview={setTestPreview} />
              <SolveSoundTestLauncher />
            </div>
          </div>
          <AchievementBadges
            awards={awards}
            limit={homeMilestonesLimit}
            lockedTeaser
            loading={Boolean(user) && awardsLoading}
            error={user ? awardsError : null}
            emptyLabel={
              user
                ? 'No milestones yet. Finish today’s puzzles or just stop by to start collecting.'
                : 'Sign in to track verified milestones across devices.'
            }
          />
        </section>
        <HomeNewsPanel />
      </div>

      <AchievementUnlockModal
        award={testPreview}
        onClose={() => setTestPreview(null)}
      />

      {archiveAfterTaste && !taste && (
        <ReaderTastePrompt onSelect={handleTasteSelect} />
      )}
      {taste && (
        <ArchiveCalendarModal
          open={showArchive}
          taste={taste}
          selectedDateKey={todayKey}
          onSelectDate={(next) => {
            setShowArchive(false)
            navigate(
              playPath(
                resolveActiveMode().id,
                next === todayKey ? null : next,
              ),
            )
          }}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  )
}
