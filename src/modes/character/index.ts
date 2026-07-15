import type { GameModeDefinition } from '../types'
import { characterModeMeta } from './config'
import { CharacterGame } from './CharacterGame'

/**
 * Character-crop variant: zoomed still of a cast member, camera pulls out
 * after wrong guesses, with the same attribute feedback as summary mode.
 */
export const characterMode: GameModeDefinition = {
  ...characterModeMeta,
  Component: CharacterGame,
}

export { CharacterGame } from './CharacterGame'
export { characterModeMeta, CHARACTER_MODE_ID } from './config'
