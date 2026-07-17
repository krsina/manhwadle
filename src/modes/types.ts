import type { ComponentType } from 'react'
import type { Manhwa } from '../lib/anilist-types'
import type { HowToPlayGuide } from '../lib/howto'
import type { ReaderTaste } from '../lib/readerTaste'

export interface GameModeProps {
  /** Answer-eligible titles (taste-filtered, or full when preference is "both") */
  pool: Manhwa[]
  /** Search / autocomplete / feedback lookup pool (same taste filter as `pool`) */
  guessPool: Manhwa[]
  /** Active reader preference — folded into daily seeds and day storage */
  taste: ReaderTaste
  /** UTC puzzle day (today or an archive date from `?date=`) */
  dateKey: string
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
  /** First-visit / “?” how-to content for this mode */
  howTo: HowToPlayGuide
  Component: ComponentType<GameModeProps>
}
