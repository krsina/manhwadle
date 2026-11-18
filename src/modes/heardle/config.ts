import { heardleHowTo } from './howTo'

export const HEARDLE_MODE_ID = 'heardle'

export const heardleModeMeta = {
  id: HEARDLE_MODE_ID,
  name: 'Heardle',
  tagline: 'Guess today’s manhwa from a song clip.',
  description: 'Listen to a short track clip and guess which manhwa it belongs to.',
  presentationKey: 'heardle' as const,
  availability: {
    // Footer-only side mode: no longer part of the daily set or the all-mode streak.
    requiredForAllMode: false,
    defaultAvailable: true,
    leaderboardEligible: true,
    footerOnly: true,
  },
  seedPrefix: 'manhwadle:heardle',
  storagePrefix: 'manhwadle:heardle:day:',
  maxGuesses: 6,
  howTo: heardleHowTo,
} as const

export { heardleHowTo } from './howTo'
