import { characterMode } from './character'
import { coverMode } from './cover'
import { summaryMode } from './summary'
import type { GameModeDefinition } from './types'

/** Default guessing variant — summary clue + attribute feedback */
export const DEFAULT_MODE_ID = summaryMode.id

/**
 * Register playable variants here.
 * Import the mode module and add it to this map.
 */
const modes: Record<string, GameModeDefinition> = {
  [summaryMode.id]: summaryMode,
  [characterMode.id]: characterMode,
  [coverMode.id]: coverMode,
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
  // Stable switcher order (Object.values insertion order can vary across builds).
  return [summaryMode, characterMode, coverMode].filter((mode) => modes[mode.id])
}
