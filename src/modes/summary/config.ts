import { summaryHowTo } from './howTo'

/** Mode metadata only — keep Component out of this file to avoid circular imports. */
export const SUMMARY_MODE_ID = 'summary'

export const summaryModeMeta = {
  id: SUMMARY_MODE_ID,
  name: 'Summary',
  tagline: 'Guess today’s manhwa as the summary unlocks.',
  seedPrefix: 'manhwadle:summary',
  storagePrefix: 'manhwadle:summary:day:',
  maxGuesses: 6,
  howTo: summaryHowTo,
} as const

export { summaryHowTo } from './howTo'
