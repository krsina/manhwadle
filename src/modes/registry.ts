import { summaryMode } from './summary'
import type { GameModeDefinition } from './types'

/** Default guessing variant — summary clue + attribute feedback */
export const DEFAULT_MODE_ID = summaryMode.id

/**
 * Register future variants here (cover crop, panel guess, etc.).
 * Import the mode module and add it to this map.
 */
const modes: Record<string, GameModeDefinition> = {
  [summaryMode.id]: summaryMode,
}

export function getMode(id: string): GameModeDefinition | undefined {
  return modes[id]
}

export function getDefaultMode(): GameModeDefinition {
  return modes[DEFAULT_MODE_ID]!
}

/** Resolve active mode; falls back to the default when unknown. */
export function resolveActiveMode(id: string = DEFAULT_MODE_ID): GameModeDefinition {
  return getMode(id) ?? getDefaultMode()
}

export function listModes(): GameModeDefinition[] {
  return Object.values(modes)
}
