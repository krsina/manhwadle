import type { GameModeDefinition } from '../types'
import { summaryModeMeta } from './config'
import { SummaryGame } from './SummaryGame'

/**
 * Classic / default variant: authored storyDescriptionBlurb tiers (t0 → t1),
 * then spoiler-scrubbed publisher description, with genre / year / status / tag feedback.
 */
export const summaryMode: GameModeDefinition = {
  ...summaryModeMeta,
  Component: SummaryGame,
}

export { SummaryGame } from './SummaryGame'
export { summaryModeMeta, SUMMARY_MODE_ID } from './config'
