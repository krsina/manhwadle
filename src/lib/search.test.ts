import { describe, expect, it } from 'vitest'
import { namesMatch, normalizeSearchKey, scoreSearchKey } from './nameMatch'
import { searchCharacters, searchManhwa } from './search'
import { makeCharacter, makeManhwa } from './testFixtures'

describe('normalizeSearchKey', () => {
  it('treats hyphens, spaces, and merged syllables as the same', () => {
    expect(normalizeSearchKey('Mo-Ri Jin')).toBe('morijin')
    expect(normalizeSearchKey('Mo Ri Jin')).toBe('morijin')
    expect(normalizeSearchKey('Mori Jin')).toBe('morijin')
    expect(namesMatch('Mo-Ri Jin', 'Mori Jin')).toBe(true)
    expect(namesMatch('Mo-Ri Jin', 'Mo Ri Jin')).toBe(true)
  })
})

describe('searchCharacters', () => {
  const cast = [
    makeCharacter({
      id: 1,
      name: { full: 'Mo-Ri Jin', native: '진모리', alternative: [] },
    }),
  ]

  it('matches hyphenated, spaced, and merged queries', () => {
    expect(searchCharacters(cast, 'Mo-Ri Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'Mo Ri Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'Mori Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'mori')).toHaveLength(1)
  })
})

describe('searchManhwa', () => {
  const pool = [
    makeManhwa({
      id: 10,
      title: {
        english: 'The God of High School',
        romaji: 'God of High School',
        native: null,
      },
      synonyms: ['God of Highschool'],
    }),
  ]

  it('matches titles ignoring hyphens and spaces', () => {
    expect(searchManhwa(pool, 'God of High-School')[0]?.manhwa.id).toBe(10)
    expect(searchManhwa(pool, 'godofhighschool')[0]?.manhwa.id).toBe(10)
  })
})

describe('scoreSearchKey', () => {
  it('ranks exact over prefix over substring', () => {
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('Mori Jin'))).toBe(0)
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('Mori'))).toBe(1)
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('jin'))).toBe(2)
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('zzz'))).toBe(Infinity)
  })
})
