import type { CSSProperties } from 'react'
import { DEFAULT_AVATAR_ID } from '../../lib/avatarComposition'
import { avatarStageCssUrl, DEFAULT_STAGE_ID } from '../../lib/avatarStages'
import { multiplayerSharedPlacement } from '../../lib/multiplayerStandings'
import { PixelAvatar } from '../PixelAvatar'

export interface MultiplayerRosterMember {
  userId: string
  username: string
  avatarId?: string | null
  stageId?: string | null
  seat: number
  ready: boolean
  status: 'active' | 'withdrawn'
  totalScore: number
  placement?: number | null
  guessCount: number
  attemptStatus?: string | null
  isHost: boolean
  isSelf: boolean
}

interface MultiplayerRosterProps {
  members: MultiplayerRosterMember[]
  maxPlayers: number
  showScores?: boolean
}

function attemptLabel(member: MultiplayerRosterMember): string {
  switch (member.attemptStatus) {
    case 'won':
      return 'Solved'
    case 'surrendered':
      return 'Gave up'
    case 'timed_out':
      return 'Out of time'
    case 'lost':
      return 'No luck'
    case 'active':
      return member.guessCount === 1 ? '1 guess' : `${member.guessCount} guesses`
    default:
      return member.guessCount > 0 ? `${member.guessCount} guesses` : 'Waiting'
  }
}

export function MultiplayerRoster({
  members,
  maxPlayers,
  showScores = false,
}: MultiplayerRosterProps) {
  const byScore = [...members].sort(
    (left, right) => right.totalScore - left.totalScore || left.seat - right.seat,
  )
  // Lobby keeps seat order; scoreboards rank by points.
  const sorted = showScores
    ? byScore
    : [...members].sort((left, right) => left.seat - right.seat)

  return (
    <ol className="multiplayer-roster" aria-label={showScores ? 'Live standings' : 'Room players'}>
      {sorted.map((member) => {
        const sharedPlacement = multiplayerSharedPlacement(byScore, member)
        const podium = showScores && sharedPlacement <= 3 ? ` is-podium-${sharedPlacement}` : ''
        const stageStyle = {
          ['--avatar-stage-url' as string]: avatarStageCssUrl(
            member.stageId ?? DEFAULT_STAGE_ID,
          ),
        } as CSSProperties
        return (
          <li
            className={`multiplayer-player${member.isSelf ? ' is-self' : ''}${
              member.status === 'withdrawn' ? ' is-withdrawn' : ''
            }${member.attemptStatus === 'won' ? ' is-solved' : ''}`}
            key={member.userId}
          >
            <span
              className={`multiplayer-player-rank${podium}`}
              aria-label={showScores ? `Place ${sharedPlacement}` : `Seat ${member.seat}`}
            >
              {showScores ? sharedPlacement : member.seat}
            </span>
            <span
              className="multiplayer-player-portrait avatar-stage-well"
              style={stageStyle}
              aria-hidden="true"
            >
              <PixelAvatar
                characterId={member.avatarId ?? DEFAULT_AVATAR_ID}
                size="sm"
                decorative
                className="multiplayer-player-avatar"
              />
            </span>
            <span className="multiplayer-player-id">
              <span className="multiplayer-player-name">
                <span className="multiplayer-player-handle">{member.username}</span>
                {member.isHost && <span className="multiplayer-player-tag">Host</span>}
                {member.isSelf && (
                  <span className="multiplayer-player-tag is-self-tag">You</span>
                )}
              </span>
              {showScores && (
                <small className="multiplayer-player-note">{attemptLabel(member)}</small>
              )}
            </span>
            <span className="multiplayer-player-state">
              {showScores ? (
                <strong className="multiplayer-player-score">
                  {member.totalScore.toLocaleString()}
                </strong>
              ) : (
                <span
                  className={`multiplayer-ready${
                    member.status === 'withdrawn'
                      ? ' is-left'
                      : member.ready
                        ? ' is-ready'
                        : ' is-waiting'
                  }`}
                >
                  {member.status === 'withdrawn'
                    ? 'Left'
                    : member.ready
                      ? 'Ready'
                      : 'Not ready'}
                </span>
              )}
            </span>
          </li>
        )
      })}
      {!showScores &&
        Array.from({ length: Math.max(0, maxPlayers - members.length) }, (_, index) => (
          <li className="multiplayer-player is-empty" key={`empty-${index}`}>
            <span className="multiplayer-player-rank">{members.length + index + 1}</span>
            <span className="multiplayer-player-portrait is-empty" aria-hidden="true" />
            <span className="multiplayer-player-id">
              <span className="multiplayer-player-name">Open slot</span>
            </span>
          </li>
        ))}
    </ol>
  )
}
