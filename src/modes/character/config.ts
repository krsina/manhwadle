import { characterHowTo } from './howTo'

export const CHARACTER_MODE_ID = 'character'

export const characterModeMeta = {
  id: CHARACTER_MODE_ID,
  name: 'Character',
  tagline: 'Guess today’s manhwa from a zoomed-in character.',
  seedPrefix: 'manhwadle:character',
  storagePrefix: 'manhwadle:character:day:',
  maxGuesses: 6,
  howTo: characterHowTo,
} as const

export { characterHowTo } from './howTo'
