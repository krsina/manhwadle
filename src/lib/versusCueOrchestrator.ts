import type {
  MultiplayerAttemptSnapshot,
  MultiplayerAttemptStatus,
  MultiplayerStateSnapshot,
} from './multiplayerTypes'
import type { VersusEffectId } from './versusEffects'
import type { VersusSoundId } from './versusSounds'

export type VersusCueEvent =
  | {
      kind: 'guess'
      effect: 'correct-guess' | 'incorrect-guess'
      sound?: VersusSoundId
    }
  | {
      kind: 'roster'
      outcome: 'solve' | 'fail'
      userId: string
      sound: 'player-solved' | 'player-failed'
    }
  | {
      kind: 'score'
      effect: 'score-change'
      userId: string
    }
  | {
      kind: 'sound'
      sound: VersusSoundId
    }
  | {
      kind: 'overlay'
      effect: Extract<VersusEffectId, 'match-victory' | 'match-defeat' | 'match-draw'>
      sound: VersusSoundId
    }

function attemptKey(
  attempt: Pick<MultiplayerAttemptSnapshot, 'roundId' | 'userId'>,
): string {
  return `${attempt.roundId}:${attempt.userId}`
}

function isFailure(status: MultiplayerAttemptStatus): boolean {
  return status === 'lost' || status === 'surrendered' || status === 'timed_out'
}

function matchResultEffect(
  state: MultiplayerStateSnapshot,
  viewerUserId: string,
): Extract<VersusEffectId, 'match-victory' | 'match-defeat' | 'match-draw'> {
  const viewer = state.members.find((member) => member.userId === viewerUserId)
  const topScore = Math.max(...state.members.map((member) => member.score), 0)
  const leaders = state.members.filter((member) => member.score === topScore)
  if (viewer?.score === topScore && leaders.length > 1) return 'match-draw'
  return viewer?.score === topScore ? 'match-victory' : 'match-defeat'
}

/**
 * Converts room snapshot transitions into one-shot battle cues.
 * The first snapshot for a room is always a silent baseline.
 */
export function collectVersusCueEvents(
  previous: MultiplayerStateSnapshot | null,
  next: MultiplayerStateSnapshot,
  viewerUserId: string,
): VersusCueEvent[] {
  if (!previous || previous.room.id !== next.room.id) return []

  const events: VersusCueEvent[] = []
  const previousAttempts = new Map(
    previous.attempts.map((attempt) => [attemptKey(attempt), attempt]),
  )

  for (const attempt of next.attempts) {
    const before = previousAttempts.get(attemptKey(attempt))
    const becameTerminal = before?.status !== attempt.status
    const guessCountIncreased = (before?.guessCount ?? 0) < attempt.guessCount

    if (attempt.userId === viewerUserId && guessCountIncreased) {
      if (attempt.status === 'won') {
        events.push({ kind: 'guess', effect: 'correct-guess' })
      } else if (attempt.status === 'active') {
        events.push({
          kind: 'guess',
          effect: 'incorrect-guess',
          sound: 'incorrect-guess',
        })
      }
    }

    if (!becameTerminal) continue
    if (attempt.status === 'won') {
      events.push({
        kind: 'roster',
        outcome: 'solve',
        userId: attempt.userId,
        sound: 'player-solved',
      })
      if (attempt.userId === viewerUserId && !guessCountIncreased) {
        events.push({ kind: 'guess', effect: 'correct-guess' })
      }
    } else if (isFailure(attempt.status)) {
      events.push({
        kind: 'roster',
        outcome: 'fail',
        userId: attempt.userId,
        sound: 'player-failed',
      })
    }
  }

  const previousTopScore = Math.max(...previous.members.map((member) => member.score), 0)
  const nextTopScore = Math.max(...next.members.map((member) => member.score), 0)
  const previousLeaders = previous.members.filter(
    (member) => member.score === previousTopScore,
  )
  const nextLeaders = next.members.filter((member) => member.score === nextTopScore)
  if (
    nextLeaders.length === 1 &&
    (previousLeaders.length !== 1 ||
      previousLeaders[0]?.userId !== nextLeaders[0]?.userId)
  ) {
    events.push({
      kind: 'score',
      effect: 'score-change',
      userId: nextLeaders[0]!.userId,
    })
  }

  if (previous.room.status === 'countdown' && next.room.status === 'active') {
    events.push({ kind: 'sound', sound: 'round-start' })
  }
  if (previous.room.status !== 'intermission' && next.room.status === 'intermission') {
    events.push({ kind: 'sound', sound: 'answer-reveal' })
  }
  if (previous.room.status !== 'completed' && next.room.status === 'completed') {
    const effect = matchResultEffect(next, viewerUserId)
    events.push({ kind: 'overlay', effect, sound: effect })
  }

  return events
}
