import type { DayState } from './anilist-types'

export type GuessLoopState = Pick<DayState, 'status' | 'guessIds'>

/**
 * Shared win/lose transition used by Summary / Cover / Character modes.
 * Returns null when the guess should be ignored (not playing or duplicate).
 */
export function applyGuess(
  state: GuessLoopState,
  guessId: number,
  answerId: number,
  maxGuesses: number,
): GuessLoopState | null {
  if (state.status !== 'playing') return null
  if (state.guessIds.includes(guessId)) return null

  const guessIds = [...state.guessIds, guessId]
  const won = guessId === answerId
  const lost = !won && guessIds.length >= maxGuesses

  return {
    guessIds,
    status: won ? 'won' : lost ? 'lost' : 'playing',
  }
}
