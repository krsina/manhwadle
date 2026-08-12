import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { multiplayerSharedPlacement } from '../../lib/multiplayerStandings'
import { MultiplayerRoster, type MultiplayerRosterMember } from './MultiplayerRoster'

function member(
  userId: string,
  totalScore: number,
  extras: Partial<MultiplayerRosterMember> = {},
): MultiplayerRosterMember {
  return {
    userId,
    username: userId,
    seat: Number(userId.slice(-1)),
    ready: true,
    status: 'active',
    totalScore,
    guessCount: 0,
    isHost: false,
    isSelf: false,
    ...extras,
  }
}

describe('multiplayerSharedPlacement', () => {
  it('gives equal scores the same placement', () => {
    const sorted = [member('user1', 2000), member('user2', 2000), member('user3', 900)]
    expect(multiplayerSharedPlacement(sorted, sorted[0]!)).toBe(1)
    expect(multiplayerSharedPlacement(sorted, sorted[1]!)).toBe(1)
    expect(multiplayerSharedPlacement(sorted, sorted[2]!)).toBe(3)
  })
})

describe('MultiplayerRoster', () => {
  it('renders equipped avatar and stage banner for each player', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoster
        maxPlayers={4}
        members={[
          member('user1', 100, {
            username: 'Host',
            avatarId: 'avatar_shadow_hunter',
            stageId: 'stage_dusk_plaza',
            isHost: true,
          }),
        ]}
      />,
    )
    expect(html).toContain('multiplayer-player-portrait')
    expect(html).toContain('avatar-stage-well')
    expect(html).toContain('dusk-plaza.png')
    expect(html).toContain('shadow-hunter.png')
    expect(html).toContain('pixel-avatar-sm')
    expect(html).toContain('is-bust')
    expect(html).toContain('Open slot')
  })

  it('marks solved and exhausted players with terminal state classes', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoster
        maxPlayers={3}
        showScores
        members={[
          member('user1', 100, { attemptStatus: 'won' }),
          member('user2', 0, { attemptStatus: 'lost', guessCount: 6 }),
          member('user3', 0, { attemptStatus: 'timed_out', guessCount: 4 }),
        ]}
      />,
    )
    expect(html).toContain('is-solved')
    expect(html.match(/is-failed/g)).toHaveLength(2)
  })

  it('targets transient outcome and lead emphasis to the changed seats', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoster
        maxPlayers={3}
        showScores
        outcomeEmphasis={{ user1: 'solve', user2: 'fail' }}
        scoreEmphasisUserId="user3"
        members={[
          member('user1', 100),
          member('user2', 0),
          member('user3', 200),
        ]}
      />,
    )
    expect(html).toContain('is-cue-solve')
    expect(html).toContain('is-cue-fail')
    expect(html).toContain('is-cue-score')
  })
})
