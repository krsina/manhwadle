import type { ComponentType } from 'react'
import type { Manhwa } from '../lib/anilist-types'

export interface GameModeProps {
  pool: Manhwa[]
}

/**
 * One playable guessing variant.
 * Add a new folder under `src/modes/`, export a definition, and register it in `registry.ts`.
 */
export interface GameModeDefinition {
  /** Stable id used in URLs / storage / seeds (e.g. "summary") */
  id: string
  /** Short label for mode switchers */
  name: string
  /** Shown under the brand in the hero */
  tagline: string
  /** Prefix for daily answer hashing — keep unique per mode */
  seedPrefix: string
  /** localStorage key prefix — keep unique per mode */
  storagePrefix: string
  maxGuesses: number
  Component: ComponentType<GameModeProps>
}
