import type { DayState } from './anilist-types'

export type ClueProgressState = Pick<DayState, 'status' | 'guessIds' | 'clueStep'>

/** Wrong title guesses so far (excludes the winning guess). */
export function wrongGuessCount(state: ClueProgressState): number {
  return state.status === 'won'
    ? Math.max(0, state.guessIds.length - 1)
    : state.guessIds.length
}

/**
 * Ladder index used by progressive clues (0 = opening hint).
 * Free “reveal more” bumps clueStep; wrong guesses also advance via count.
 */
export function clueProgress(state: ClueProgressState): number {
  return Math.max(wrongGuessCount(state), state.clueStep ?? 0)
}

export function canAdvanceClue(
  state: ClueProgressState,
  maxStep: number,
): boolean {
  if (state.status !== 'playing') return false
  if (maxStep <= 0) return false
  return clueProgress(state) < maxStep
}

/**
 * Advance the clue ladder without appending a guess.
 * Returns null when not playing or already at the last step.
 */
export function advanceClue(
  state: DayState,
  maxStep: number,
): DayState | null {
  if (!canAdvanceClue(state, maxStep)) return null
  return {
    ...state,
    clueStep: clueProgress(state) + 1,
    hintsUsed: (state.hintsUsed ?? 0) + 1,
  }
}
