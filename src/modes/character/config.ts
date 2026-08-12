import { characterHowTo } from './howTo'

export const CHARACTER_MODE_ID = 'character'

export const characterModeMeta = {
  id: CHARACTER_MODE_ID,
  name: 'Character',
  tagline: 'Guess today’s manhwa from a character still.',
  description:
    'Identify the series from a character portrait. Hard Mode zooms in and starts pixelated.',
  presentationKey: 'character' as const,
  availability: {
    requiredForAllMode: true,
    defaultAvailable: true,
    leaderboardEligible: true,
  },
  seedPrefix: 'manhwadle:character',
  storagePrefix: 'manhwadle:character:day:',
  maxGuesses: 6,
  howTo: characterHowTo,
} as const

export { characterHowTo } from './howTo'
