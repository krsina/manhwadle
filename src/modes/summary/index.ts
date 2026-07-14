import type { GameModeDefinition } from '../types'
import { summaryModeMeta } from './config'
import { SummaryGame } from './SummaryGame'

/**
 * Classic / default variant: spoiler-scrubbed synopsis as the clue,
 * with genre / year / status / tag feedback after each guess.
 */
export const summaryMode: GameModeDefinition = {
  ...summaryModeMeta,
  Component: SummaryGame,
}

export { SummaryGame } from './SummaryGame'
export { summaryModeMeta, SUMMARY_MODE_ID } from './config'
