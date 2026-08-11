export const MULTIPLAYER_ROUND_MS = 180_000

/** Client-side display/test mirror. The database remains authoritative. */
export function multiplayerRoundScore(
  guessNumber: number,
  elapsedMs: number,
): number {
  const normalizedGuess = Math.min(6, Math.max(1, Math.floor(guessNumber)))
  const normalizedElapsed = Math.min(
    MULTIPLAYER_ROUND_MS,
    Math.max(0, elapsedMs),
  )
  const guessMultiplier = Math.max(1, 7 - normalizedGuess) / 6
  const speedMultiplier = Math.max(
    0.1,
    Math.min(1, (MULTIPLAYER_ROUND_MS - normalizedElapsed) / MULTIPLAYER_ROUND_MS),
  )
  return Math.round(1000 * guessMultiplier * speedMultiplier)
}
