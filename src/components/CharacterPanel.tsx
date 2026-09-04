import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ACHIEVEMENTS_CHANGED_EVENT } from '../lib/achievementUnlocks'
import { DEFAULT_AVATAR_ID } from '../lib/avatarComposition'
import { avatarStageCssUrl, DEFAULT_STAGE_ID } from '../lib/avatarStages'
import {
  fetchMyAchievements,
  fetchMyLeaderboardStanding,
  fetchMyLevelRank,
} from '../lib/leaderboardApi'
import {
  DEV_LEADERBOARD_EVENT,
  isDevLeaderboardOverrideEnabled,
} from '../lib/leaderboardDevFake'
import { playerLevelFromXp } from '../lib/playerLevel'
import { isLocalGachaShop } from '../lib/gachaLocalStore'
import { shopLookPath } from '../lib/routes'
import { useAuth } from './AuthProvider'
import { useOptionalGachaLocal } from './gacha/GachaLocalProvider'
import { PixelAvatar } from './PixelAvatar'

/**
 * Home character card: username, equipped Style A avatar, level from lifetime XP,
 * dense rank, and a few play stats.
 */
export function CharacterPanel() {
  const { user, account, accountLoading, configured } = useAuth()
  const gacha = useOptionalGachaLocal()
  const signedIn = Boolean(user)
  const username = account?.username?.trim() || null
  const avatarId = gacha?.snapshot.equippedAvatarId ?? account?.equippedAvatarId ?? DEFAULT_AVATAR_ID
  const stageId = account?.equippedStageId ?? DEFAULT_STAGE_ID
  const stageStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(stageId),
  } as CSSProperties
  const level = playerLevelFromXp(account?.lifetimeEarned ?? 0)
  const progressPct = Math.round(level.progress * 100)
  const [rank, setRank] = useState<number | null>(null)
  const [rankLoading, setRankLoading] = useState(false)
  const [currentStreak, setCurrentStreak] = useState<number | null>(null)
  const [longestStreak, setLongestStreak] = useState<number | null>(null)
  const [completions, setCompletions] = useState<number | null>(null)
  const [milestones, setMilestones] = useState<number | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    function onReload() {
      setReloadToken((n) => n + 1)
    }
    window.addEventListener(DEV_LEADERBOARD_EVENT, onReload)
    window.addEventListener(ACHIEVEMENTS_CHANGED_EVENT, onReload)
    return () => {
      window.removeEventListener(DEV_LEADERBOARD_EVENT, onReload)
      window.removeEventListener(ACHIEVEMENTS_CHANGED_EVENT, onReload)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const useDev = import.meta.env.DEV && isDevLeaderboardOverrideEnabled()
    if (!useDev && (!configured || !user)) {
      setRank(null)
      setRankLoading(false)
      setCurrentStreak(null)
      setLongestStreak(null)
      setCompletions(null)
      setMilestones(null)
      setStatsLoading(false)
      return
    }
    setRankLoading(true)
    setStatsLoading(true)
    void Promise.all([
      fetchMyLevelRank(),
      fetchMyLeaderboardStanding(),
      fetchMyAchievements(),
    ]).then(([rankResult, standingResult, achievementsResult]) => {
      if (cancelled) return
      setRank(rankResult.ok ? rankResult.standing.rank : null)
      setRankLoading(false)
      if (standingResult.ok) {
        setCurrentStreak(standingResult.standing.anyCurrentStreak)
        setLongestStreak(standingResult.standing.anyMaxStreak)
        setCompletions(standingResult.standing.totalCompletions)
      } else {
        setCurrentStreak(useDev ? 0 : null)
        setLongestStreak(useDev ? 0 : null)
        setCompletions(useDev ? 0 : null)
      }
      setMilestones(
        achievementsResult.ok
          ? achievementsResult.awards.length
          : useDev
            ? 0
            : null,
      )
      setStatsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user, configured, account?.lifetimeEarned, reloadToken])

  const rankLabel = !signedIn
    ? '—'
    : rankLoading && rank == null
      ? '…'
      : rank != null
        ? String(rank)
        : '—'

  function formatStat(value: number | null): string {
    if (!signedIn) return '—'
    if (statsLoading && value == null) return '…'
    if (value == null) return '—'
    return String(value)
  }

  const lookBase = { collection: isLocalGachaShop() } as const
  const characterLookPath = shopLookPath({ ...lookBase, tab: 'characters' })
  const backgroundLookPath = shopLookPath({ ...lookBase, tab: 'backgrounds' })

  return (
    <section className="character-panel" aria-labelledby="character-panel-heading">
      <div className="character-panel-head">
        <h2 id="character-panel-heading" className="home-section-title">
          Character
        </h2>
      </div>

      <div className="character-panel-body">
        <div className="character-panel-identity">
          <p className="character-panel-username">
            {!signedIn
              ? 'Guest'
              : accountLoading && !account
                ? '…'
                : username ?? 'Pick a username'}
          </p>
          <p
            className="character-panel-rank"
            aria-label={
              signedIn
                ? rank != null
                  ? `Level rank ${rank}`
                  : 'Level rank unavailable'
                : 'Sign in to see level rank'
            }
          >
            <span className="character-panel-rank-chip">Rank · {rankLabel}</span>
          </p>
        </div>

        <Link
          className="character-panel-avatar avatar-stage-well"
          to={characterLookPath}
          style={stageStyle}
          aria-label="Change character"
        >
          <PixelAvatar characterId={avatarId} size="lg" decorative />
        </Link>

        <div className="character-panel-edit-actions">
          <Link className="btn btn-primary" to={characterLookPath}>
            Change character
          </Link>
          <Link className="btn btn-ghost" to={backgroundLookPath}>
            Change background
          </Link>
        </div>

        <div
          className="character-panel-level"
          aria-label={
            signedIn
              ? `Level ${level.level}, ${level.xpIntoLevel} of ${level.xpForNext} XP to next level`
              : 'Sign in to track level'
          }
        >
          <div className="character-panel-level-row">
            <span className="character-panel-level-label">Level {level.level}</span>
            <span className="character-panel-level-xp">
              {signedIn ? `${level.xpIntoLevel} / ${level.xpForNext} XP` : '—'}
            </span>
          </div>
          <div
            className="character-panel-xp-track"
            role="progressbar"
            aria-label={
              signedIn
                ? `Level progress, ${level.xpIntoLevel} of ${level.xpForNext} XP`
                : 'Level progress'
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={signedIn ? progressPct : 0}
          >
            <span
              className="character-panel-xp-fill"
              style={{ width: signedIn ? `${progressPct}%` : '0%' }}
            />
          </div>
        </div>

        <dl className="character-panel-stats">
          <div className="character-panel-stat">
            <dt>Streak</dt>
            <dd>{formatStat(currentStreak)}</dd>
          </div>
          <div className="character-panel-stat">
            <dt>Longest</dt>
            <dd>{formatStat(longestStreak)}</dd>
          </div>
          <div className="character-panel-stat">
            <dt>Plays</dt>
            <dd>{formatStat(completions)}</dd>
          </div>
          <div className="character-panel-stat">
            <dt>Milestones</dt>
            <dd>{formatStat(milestones)}</dd>
          </div>
        </dl>

        {!signedIn && (
          <p className="character-panel-hint">
            {configured
              ? 'Sign in to equip an avatar and earn XP toward your level.'
              : 'Account sync is unavailable in this environment.'}
          </p>
        )}
        {signedIn && !username && (
          <p className="character-panel-hint">Set a username from the account menu.</p>
        )}
      </div>
    </section>
  )
}
