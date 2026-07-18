import { heardleHowTo } from './howTo'

export const HEARDLE_MODE_ID = 'heardle'

export const heardleModeMeta = {
  id: HEARDLE_MODE_ID,
  name: 'Heardle',
  tagline: 'Guess today’s manhwa from a song clip.',
  seedPrefix: 'manhwadle:heardle',
  storagePrefix: 'manhwadle:heardle:day:',
  maxGuesses: 6,
  howTo: heardleHowTo,
} as const

export { heardleHowTo } from './howTo'
