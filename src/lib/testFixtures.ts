import type { Manhwa, ManhwaCharacter } from './anilist-types'

export function makeCharacter(
  overrides: Partial<ManhwaCharacter> & Pick<ManhwaCharacter, 'id'>,
): ManhwaCharacter {
  return {
    role: 'MAIN',
    name: { full: `Char ${overrides.id}`, native: null, alternative: [] },
    description: null,
    image: {
      large: `https://s4.anilist.co/file/anilistcdn/character/large/b${overrides.id}.jpg`,
      medium: `https://s4.anilist.co/file/anilistcdn/character/medium/b${overrides.id}.jpg`,
    },
    siteUrl: null,
    favourites: 1,
    useForGuess: true,
    ...overrides,
  }
}

export function makeManhwa(
  overrides: Partial<Manhwa> & Pick<Manhwa, 'id'>,
): Manhwa {
  return {
    title: {
      english: `Title ${overrides.id}`,
      romaji: null,
      native: null,
    },
    synonyms: [],
    description: 'A story.',
    genres: ['Action', 'Fantasy'],
    tags: ['Isekai'],
    status: 'Ongoing',
    publisher: 'WEBTOON',
    startDate: { year: 2020, month: 1, day: 1 },
    coverImage: `https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx${overrides.id}.jpg`,
    siteUrl: `https://anilist.co/manga/${overrides.id}`,
    characters: [],
    ...overrides,
  }
}
