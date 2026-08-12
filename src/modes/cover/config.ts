import { coverHowTo } from './howTo'

export const COVER_MODE_ID = 'cover'

export const coverModeMeta = {
  id: COVER_MODE_ID,
  name: 'Cover',
  tagline: 'Guess today’s manhwa from a zoomed-in cover.',
  description:
    'Study a tight cover crop and pull back the camera with each miss. Hard Mode adds heavy pixelation.',
  presentationKey: 'cover' as const,
  availability: {
    requiredForAllMode: true,
    defaultAvailable: true,
    leaderboardEligible: true,
  },
  seedPrefix: 'manhwadle:cover',
  storagePrefix: 'manhwadle:cover:day:',
  maxGuesses: 6,
  howTo: coverHowTo,
} as const

export { coverHowTo } from './howTo'
