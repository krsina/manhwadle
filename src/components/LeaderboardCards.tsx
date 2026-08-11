import type { CSSProperties } from 'react'
import { PixelAvatar } from './PixelAvatar'
import type { LeaderboardEntry } from '../lib/leaderboard'
import { avatarStageCssUrl, DEFAULT_STAGE_ID } from '../lib/avatarStages'

export function entryKey(entry: LeaderboardEntry): string {
  return `${entry.publicId}-${entry.rank}-${entry.value}`
}

/** Streak length label: "Day" / "Days". */
export function leaderboardDayUnit(value: number): string {
  return value === 1 ? 'Day' : 'Days'
}

export function RankBadge({ rank }: { rank: number }) {
  const n = Number.isFinite(rank) && rank >= 1 ? Math.floor(rank) : 0
  if (n === 1 || n === 2 || n === 3) {
    const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : '🥉'
    return (
      <span className="leaderboard-rank-badge">
        <span className="leaderboard-medal" aria-hidden="true">
          {medal}
        </span>
        <span className="leaderboard-rank-num">{n}</span>
      </span>
    )
  }
  return <span className="leaderboard-rank-num">{n > 0 ? n : '—'}</span>
}

function topClass(rank: number): string {
  return rank >= 1 && rank <= 3 ? ` is-top is-top-${rank}` : ''
}

/** Compact list row (avatar + name + streak; no stage). */
export function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li className={`leaderboard-row${topClass(entry.rank)}`}>
      <span className="leaderboard-rank" aria-label={`Rank ${entry.rank}`}>
        <RankBadge rank={entry.rank} />
      </span>
      <span className="leaderboard-player">
        <PixelAvatar
          characterId={entry.equippedAvatarId}
          size="sm"
          decorative
          className="leaderboard-avatar"
        />
        <span className="leaderboard-name">{entry.username}</span>
      </span>
      <span className="leaderboard-value">
        <span className="leaderboard-value-num">{entry.value}</span>
        <span className="leaderboard-value-unit" aria-hidden="true">
          {leaderboardDayUnit(entry.value)}
        </span>
      </span>
    </li>
  )
}

type ShowcaseVariant = 'podium' | 'hero'

/** Character + stage card. Podium = home top-3 layout; hero = flat full-page grid. */
export function LeaderboardShowcaseCard({
  entry,
  variant = 'podium',
}: {
  entry: LeaderboardEntry
  variant?: ShowcaseVariant
}) {
  const podium =
    variant === 'podium' && entry.rank >= 1 && entry.rank <= 3
      ? ` is-podium-${entry.rank}`
      : ''
  const stageStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(
      entry.equippedStageId ?? DEFAULT_STAGE_ID,
    ),
  } as CSSProperties
  const cardClass =
    variant === 'hero'
      ? `leaderboard-hero-card${topClass(entry.rank)}`
      : `leaderboard-showcase-card${topClass(entry.rank)}${podium}`

  return (
    <li className={cardClass}>
      <div
        className={`${variant === 'hero' ? 'leaderboard-hero-stage' : 'leaderboard-showcase-stage'} avatar-stage-well`}
        style={stageStyle}
      >
        <span
          className={
            variant === 'hero' ? 'leaderboard-hero-rank' : 'leaderboard-showcase-rank'
          }
          aria-label={`Rank ${entry.rank}`}
        >
          <RankBadge rank={entry.rank} />
        </span>
        <PixelAvatar
          characterId={entry.equippedAvatarId}
          size="md"
          decorative
          className={
            variant === 'hero' ? 'leaderboard-hero-avatar' : 'leaderboard-showcase-avatar'
          }
        />
      </div>
      <div
        className={
          variant === 'hero' ? 'leaderboard-hero-meta' : 'leaderboard-showcase-meta'
        }
      >
        <span
          className={
            variant === 'hero' ? 'leaderboard-hero-name' : 'leaderboard-showcase-name'
          }
        >
          {entry.username}
        </span>
        <span
          className={
            variant === 'hero' ? 'leaderboard-hero-value' : 'leaderboard-showcase-value'
          }
        >
          <span className="leaderboard-value-num">{entry.value}</span>
          <span className="leaderboard-value-unit" aria-hidden="true">
            {leaderboardDayUnit(entry.value)}
          </span>
        </span>
      </div>
    </li>
  )
}
