import { type ComponentType } from 'react'
import { characterModeMeta } from './character/config'
import { coverModeMeta } from './cover/config'
import { heardleModeMeta } from './heardle/config'
import { summaryModeMeta } from './summary/config'
import { lazyWithStaleReload } from '../lib/lazyWithStaleReload'
import type { GameModeDefinition, GameModeProps } from './types'

/** Default guessing variant — summary clue + attribute feedback */
export const DEFAULT_MODE_ID = summaryModeMeta.id

const SummaryGame = lazyWithStaleReload(() =>
  import('./summary/SummaryGame').then((m) => ({ default: m.SummaryGame })),
)
const CharacterGame = lazyWithStaleReload(() =>
  import('./character/CharacterGame').then((m) => ({ default: m.CharacterGame })),
)
const CoverGame = lazyWithStaleReload(() =>
  import('./cover/CoverGame').then((m) => ({ default: m.CoverGame })),
)
const HeardleGame = lazyWithStaleReload(() =>
  import('./heardle/HeardleGame').then((m) => ({ default: m.HeardleGame })),
)

function defineMode(
  meta: Omit<GameModeDefinition, 'Component'>,
  Component: ComponentType<GameModeProps>,
): GameModeDefinition {
  return { ...meta, Component }
}

/**
 * Register playable variants here.
 * Game components are lazy-loaded so unused modes stay out of the initial chunk.
 */
const modes: Record<string, GameModeDefinition> = {
  [summaryModeMeta.id]: defineMode(summaryModeMeta, SummaryGame),
  [characterModeMeta.id]: defineMode(characterModeMeta, CharacterGame),
  [coverModeMeta.id]: defineMode(coverModeMeta, CoverGame),
  [heardleModeMeta.id]: defineMode(heardleModeMeta, HeardleGame),
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
  return [
    modes[summaryModeMeta.id]!,
    modes[characterModeMeta.id]!,
    modes[coverModeMeta.id]!,
    modes[heardleModeMeta.id]!,
  ].filter(Boolean)
}

/** Modes in the daily set: homepage rows, mode tabs, and next-mode prompts. */
export function listDailyModes(): GameModeDefinition[] {
  return listModes().filter((mode) => !mode.availability.footerOnly)
}

/** Playable modes linked only from the site footer (e.g. Heardle). */
export function listFooterModes(): GameModeDefinition[] {
  return listModes().filter((mode) => mode.availability.footerOnly)
}
