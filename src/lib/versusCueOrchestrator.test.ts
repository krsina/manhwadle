import { describe, expect, it } from 'vitest'
import type {
  MultiplayerAttemptSnapshot,
  MultiplayerAttemptStatus,
  MultiplayerMemberSnapshot,
  MultiplayerRoomStatus,
  MultiplayerStateSnapshot,
} from './multiplayerTypes'
import { collectVersusCueEvents } from './versusCueOrchestrator'

function member(
  userId: string,
  score = 0,
  rank: number | null = null,
): MultiplayerMemberSnapshot {
  return {
    userId,
    username: userId,
    avatarId: null,
    stageId: null,
    isHost: userId === 'viewer',
    isReady: true,
    isActive: true,
    hasSurrendered: false,
    score,
    rank,
    joinedAt: null,
  }
}

function attempt(
  userId: string,
  status: MultiplayerAttemptStatus = 'active',
  guessCount = 0,
): MultiplayerAttemptSnapshot {
  return {
    roundId: 'round-1',
    userId,
    status,
    guessCount,
    guessIds: userId === 'viewer' ? [] : null,
    feedback: userId === 'viewer' ? [] : null,
    score: 0,
    elapsedMs: null,
    finalizedAt: status === 'active' ? null : '2026-08-12T10:00:00Z',
    isViewer: userId === 'viewer',
  }
}

function snapshot(options: {
  roomId?: string
  status?: MultiplayerRoomStatus
  attempts?: MultiplayerAttemptSnapshot[]
  members?: MultiplayerMemberSnapshot[]
  version?: number
} = {}): MultiplayerStateSnapshot {
  return {
    room: {
      id: options.roomId ?? 'room-1',
      code: 'ABC234',
      hostUserId: 'viewer',
      status: options.status ?? 'active',
      selectedModes: ['summary'],
      roundsPerMode: 3,
      minPlayers: 2,
      maxPlayers: 8,
      memberCount: options.members?.length ?? 2,
      currentRoundIndex: 0,
      taste: null,
      poolSource: 'both',
      createdAt: null,
      startedAt: null,
      completedAt: null,
      expiresAt: null,
      phaseEndsAt: null,
    },
    members: options.members ?? [member('viewer'), member('rival')],
    rounds: [
      {
        id: 'round-1',
        index: 0,
        mode: 'summary',
        modeRound: 1,
        status: options.status === 'countdown' ? 'countdown' : 'active',
        clue: {},
        answerId: null,
        answerLabel: null,
        maxGuesses: 6,
        startsAt: null,
        endsAt: null,
        completedAt: null,
      },
    ],
    attempts: options.attempts ?? [attempt('viewer'), attempt('rival')],
    listContributions: [],
    poolSummary: {
      contributorCount: 0,
      requiredContributorCount: 0,
      activeMemberCount: options.members?.length ?? 2,
      uniqueTitleCount: 0,
      perModeEligibleCounts: {},
      combinedEligibleCount: 0,
    },
    serverNow: null,
    version: options.version ?? 1,
  }
}

describe('collectVersusCueEvents', () => {
  it('silently baselines initial snapshots and room changes', () => {
    const current = snapshot({
      attempts: [attempt('viewer', 'won', 2), attempt('rival', 'lost', 6)],
    })
    expect(collectVersusCueEvents(null, current, 'viewer')).toEqual([])
    expect(
      collectVersusCueEvents(current, snapshot({ roomId: 'room-2' }), 'viewer'),
    ).toEqual([])
  })

  it('emits local incorrect and correct guess feedback without duplicate solve audio', () => {
    const before = snapshot()
    const incorrect = snapshot({
      attempts: [attempt('viewer', 'active', 1), attempt('rival')],
      version: 2,
    })
    expect(collectVersusCueEvents(before, incorrect, 'viewer')).toEqual([
      { kind: 'guess', effect: 'incorrect-guess', sound: 'incorrect-guess' },
    ])

    const solved = snapshot({
      attempts: [attempt('viewer', 'won', 2), attempt('rival')],
      version: 3,
    })
    expect(collectVersusCueEvents(incorrect, solved, 'viewer')).toEqual([
      { kind: 'guess', effect: 'correct-guess' },
      {
        kind: 'roster',
        outcome: 'solve',
        userId: 'viewer',
        sound: 'player-solved',
      },
    ])
  })

  it('announces simultaneous solve, exhausted, surrender, and timeout outcomes once', () => {
    const users = ['viewer', 'winner', 'exhausted', 'gave-up', 'timed-out']
    const before = snapshot({
      members: users.map((userId) => member(userId)),
      attempts: users.map((userId) => attempt(userId)),
    })
    const after = snapshot({
      members: users.map((userId) => member(userId)),
      attempts: [
        attempt('viewer'),
        attempt('winner', 'won', 3),
        attempt('exhausted', 'lost', 6),
        attempt('gave-up', 'surrendered', 2),
        attempt('timed-out', 'timed_out', 4),
      ],
      version: 2,
    })
    expect(collectVersusCueEvents(before, after, 'viewer')).toEqual([
      {
        kind: 'roster',
        outcome: 'solve',
        userId: 'winner',
        sound: 'player-solved',
      },
      {
        kind: 'roster',
        outcome: 'fail',
        userId: 'exhausted',
        sound: 'player-failed',
      },
      {
        kind: 'roster',
        outcome: 'fail',
        userId: 'gave-up',
        sound: 'player-failed',
      },
      {
        kind: 'roster',
        outcome: 'fail',
        userId: 'timed-out',
        sound: 'player-failed',
      },
    ])
    expect(collectVersusCueEvents(after, { ...after, version: 3 }, 'viewer')).toEqual([])
  })

  it('emphasizes a newly sole leader', () => {
    const before = snapshot({
      members: [member('viewer', 0, 1), member('rival', 0, 1)],
    })
    const after = snapshot({
      members: [member('viewer', 1200, 1), member('rival', 0, 2)],
      version: 2,
    })
    expect(collectVersusCueEvents(before, after, 'viewer')).toContainEqual({
      kind: 'score',
      effect: 'score-change',
      userId: 'viewer',
    })
  })

  it('emits round-start and answer-reveal sounds on phase transitions', () => {
    const countdown = snapshot({ status: 'countdown' })
    const active = snapshot({ status: 'active', version: 2 })
    const intermission = snapshot({ status: 'intermission', version: 3 })
    expect(collectVersusCueEvents(countdown, active, 'viewer')).toContainEqual({
      kind: 'sound',
      sound: 'round-start',
    })
    expect(collectVersusCueEvents(active, intermission, 'viewer')).toContainEqual({
      kind: 'sound',
      sound: 'answer-reveal',
    })
  })

  it.each([
    {
      label: 'victory',
      members: [member('viewer', 2000, 1), member('rival', 1000, 2)],
      effect: 'match-victory',
    },
    {
      label: 'defeat',
      members: [member('viewer', 1000, 2), member('rival', 2000, 1)],
      effect: 'match-defeat',
    },
    {
      label: 'draw',
      members: [member('viewer', 2000, 1), member('rival', 2000, 1)],
      effect: 'match-draw',
    },
  ] as const)('emits the correct match $label overlay', ({ members, effect }) => {
    const active = snapshot({ members })
    const completed = snapshot({ members, status: 'completed', version: 2 })
    expect(collectVersusCueEvents(active, completed, 'viewer')).toContainEqual({
      kind: 'overlay',
      effect,
      sound: effect,
    })
  })
})
