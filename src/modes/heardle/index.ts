import type { GameModeDefinition } from '../types'
import { heardleModeMeta } from './config'
import { HeardleGame } from './HeardleGame'

/**
 * Heardle variant: progressive YouTube OST clips (vocals; hard adds BGM).
 */
export const heardleMode: GameModeDefinition = {
  ...heardleModeMeta,
  Component: HeardleGame,
}

export { HeardleGame } from './HeardleGame'
export { heardleModeMeta, HEARDLE_MODE_ID } from './config'
