import { multiplayerModeLabel } from './multiplayerModeMeta'
import type {
  MultiplayerMode,
  MultiplayerRoundStatus,
} from '../../lib/multiplayerTypes'

export interface MultiplayerProgressRound {
  index: number
  mode: MultiplayerMode
  modeRound: number
  status: MultiplayerRoundStatus
}

interface MultiplayerRoundProgressProps {
  rounds: MultiplayerProgressRound[]
  currentIndex: number | null
}

/** Pip strip showing where the match is in the fixed round order. */
export function MultiplayerRoundProgress({
  rounds,
  currentIndex,
}: MultiplayerRoundProgressProps) {
  if (rounds.length === 0) return null
  const ordered = [...rounds].sort((left, right) => left.index - right.index)

  return (
    <ol className="multiplayer-round-progress" aria-label="Match progress">
      {ordered.map((round) => {
        const current = round.index === currentIndex
        const done = round.status === 'completed' && !current
        const state = current ? ' is-current' : done ? ' is-done' : ''
        return (
          <li
            key={round.index}
            className={`multiplayer-round-pip${state}`}
            data-mode={round.mode}
            aria-current={current ? 'step' : undefined}
          >
            <span className="visually-hidden">
              {`Round ${round.index + 1}: ${multiplayerModeLabel(round.mode)} ${round.modeRound}`}
              {current ? ' (current)' : done ? ' (done)' : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
