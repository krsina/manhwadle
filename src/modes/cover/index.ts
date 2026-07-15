import type { GameModeDefinition } from '../types'
import { coverModeMeta } from './config'
import { CoverGame } from './CoverGame'

/**
 * Cover-crop variant: zoomed manhwa cover art that pulls out after wrong
 * guesses, with the same attribute feedback as summary mode.
 */
export const coverMode: GameModeDefinition = {
  ...coverModeMeta,
  Component: CoverGame,
}

export { CoverGame } from './CoverGame'
export { coverModeMeta, COVER_MODE_ID } from './config'
