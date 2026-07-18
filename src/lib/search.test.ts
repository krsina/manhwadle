import { describe, expect, it } from 'vitest'
import {
  nameOrderVariants,
  namesMatch,
  normalizeSearchKey,
  scoreSearchKey,
  scoreStrongSearchKey,
} from './nameMatch'
import {
  CHARACTER_SEARCH_LIMIT,
  latinFriendlyDisplayLabel,
  searchCharacters,
  searchManhwa,
} from './search'
import { withNameOrderAliases } from './characterNames'
import { makeCharacter, makeManhwa } from './testFixtures'

describe('normalizeSearchKey', () => {
  it('treats hyphens, spaces, and merged syllables as the same', () => {
    expect(normalizeSearchKey('Mo-Ri Jin')).toBe('morijin')
    expect(normalizeSearchKey('Mo Ri Jin')).toBe('morijin')
    expect(normalizeSearchKey('Mori Jin')).toBe('morijin')
    expect(namesMatch('Mo-Ri Jin', 'Mori Jin')).toBe(true)
    expect(namesMatch('Mo-Ri Jin', 'Mo Ri Jin')).toBe(true)
  })

  it('treats English possessives as optional', () => {
    expect(namesMatch("Doctor's Rebirth", 'Doctor Rebirth')).toBe(true)
    expect(namesMatch('Doctor’s Rebirth', 'Doctor Rebirth')).toBe(true)
    expect(scoreSearchKey("Doctor's Rebirth", normalizeSearchKey('doctor rebirth'))).toBe(0)
    expect(scoreSearchKey("Doctor's Rebirth", normalizeSearchKey("doctor's rebirth"))).toBe(0)
    expect(scoreSearchKey("Doctor's Rebirth", normalizeSearchKey('doctor'))).toBe(1)
  })
})

describe('name order variants', () => {
  it('accepts either given/family order for two-token Latin names', () => {
    expect(nameOrderVariants('Seol Kang')).toEqual(['Seol Kang', 'Kang Seol'])
    expect(namesMatch('Seol Kang', 'Kang Seol')).toBe(true)
    expect(namesMatch('Kang Seol', 'Seol Kang')).toBe(true)
    expect(scoreSearchKey('Seol Kang', normalizeSearchKey('Kang Seol'))).toBe(0)
  })

  it('keeps single-token and non-Latin names unchanged', () => {
    expect(nameOrderVariants('Sungjinwoo')).toEqual(['Sungjinwoo'])
    expect(nameOrderVariants('강설')).toEqual(['강설'])
  })

  it('stores the reversed order as an alternative alias', () => {
    const next = withNameOrderAliases({
      full: 'Seol Kang',
      native: '강설',
      alternative: ['Snowman'],
    })
    expect(next.alternative).toContain('Kang Seol')
    expect(next.full).toBe('Seol Kang')
  })
})

describe('scoreStrongSearchKey', () => {
  it('accepts exact and prefix only', () => {
    expect(scoreStrongSearchKey('Kang Seol', normalizeSearchKey('Kang Seol'))).toBe(0)
    expect(scoreStrongSearchKey('Kang Seol', normalizeSearchKey('Kang'))).toBe(1)
    expect(scoreStrongSearchKey('Snowman', normalizeSearchKey('owman'))).toBe(Infinity)
  })
})

describe('searchCharacters', () => {
  const cast = [
    makeCharacter({
      id: 1,
      name: { full: 'Mo-Ri Jin', native: '진모리', alternative: [] },
    }),
    makeCharacter({
      id: 2,
      name: {
        full: 'Seol Kang',
        native: '강설',
        alternative: ['Snowman', 'Kang Seol'],
      },
    }),
  ]

  it('matches hyphenated, spaced, and merged queries', () => {
    expect(searchCharacters(cast, 'Mo-Ri Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'Mo Ri Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'Mori Jin')[0]?.character.id).toBe(1)
    expect(searchCharacters(cast, 'mori')).toHaveLength(1)
  })

  it('mirrors the typed name order in the dropdown label', () => {
    expect(searchCharacters(cast, 'Kang Seol')[0]).toMatchObject({
      character: { id: 2 },
      label: 'Kang Seol',
    })
    expect(searchCharacters(cast, 'Kang')[0]?.label).toBe('Kang Seol')
    expect(searchCharacters(cast, 'Seol')[0]?.label).toBe('Seol Kang')
  })

  it('returns one row per character even when many aliases match', () => {
    const hits = searchCharacters(cast, 'Kang')
    expect(hits.filter((h) => h.character.id === 2)).toHaveLength(1)
  })

  it('requires a strong match (exact/prefix) and min query length', () => {
    // Too short
    expect(searchCharacters(cast, 'a')).toEqual([])
    expect(searchCharacters(cast, 'K')).toEqual([])
    // Substring-only of an alias should not appear
    expect(searchCharacters(cast, 'owman')).toEqual([])
    // Strong prefix still works
    expect(searchCharacters(cast, 'Sno')[0]?.label).toBe('Snowman')
  })

  it('caps results at 25 and uses leftover ranking only for 4+ char queries', () => {
    const crowded = Array.from({ length: 40 }, (_, i) =>
      makeCharacter({
        id: 100 + i,
        name: {
          full:
            i === 30
              ? 'Jin-U Seong'
              : `Jin-U ExtraVeryLongSurname${String(i).padStart(2, '0')}`,
          native: null,
          alternative: [],
        },
      }),
    )

    // Under 4 chars: alphabetical among strong hits (no leftover boost)
    const short = searchCharacters(crowded, 'jin')
    expect(short.length).toBeLessThanOrEqual(CHARACTER_SEARCH_LIMIT)
    expect(short).toHaveLength(CHARACTER_SEARCH_LIMIT)
    // With alpha order, "Jin-U Extra..." comes before "Jin-U Seong"
    expect(short[0]?.label.startsWith('Jin-U Extra')).toBe(true)

    // 4+ chars: shorter leftover rises — Jin-U Seong beats longer Jin-U Extra... names
    const long = searchCharacters(crowded, 'jinu')
    expect(long[0]?.character.id).toBe(130)
    expect(long[0]?.label).toBe('Jin-U Seong')
    expect(long.length).toBeLessThanOrEqual(CHARACTER_SEARCH_LIMIT)
  })
  it('strips Hangul from dropdown labels when the query is Latin', () => {
    const cast = [
      makeCharacter({
        id: 9,
        name: {
          full: 'Yslat Han',
          native: '한 이스라트',
          alternative: ['Seo-Jin Han (한서진)', 'Loki'],
        },
      }),
    ]
    expect(searchCharacters(cast, 'seo')[0]?.label).toBe('Seo-Jin Han')
    expect(searchCharacters(cast, 'Seo-Jin')[0]?.label).toBe('Seo-Jin Han')
  })
})

describe('latinFriendlyDisplayLabel', () => {
  it('strips parenthetical Hangul for Latin queries', () => {
    expect(latinFriendlyDisplayLabel('Seo-Jin Han (한서진)', 'seo')).toBe('Seo-Jin Han')
    expect(latinFriendlyDisplayLabel('Chi-Yeol (송치열)', 'chi')).toBe('Chi-Yeol')
  })

  it('keeps Hangul when the query contains Hangul', () => {
    expect(latinFriendlyDisplayLabel('Seo-Jin Han (한서진)', '한서진')).toBe(
      'Seo-Jin Han (한서진)',
    )
  })
})

describe('scoreSearchKey', () => {
  it('ranks exact over prefix over substring', () => {
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('Mori Jin'))).toBe(0)
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('Mori'))).toBe(1)
    // "jin" prefixes the reversed variant "Jin Mo-Ri"
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('jin'))).toBe(1)
    expect(scoreSearchKey('God of High School', normalizeSearchKey('high'))).toBe(2)
    expect(scoreSearchKey('Mo-Ri Jin', normalizeSearchKey('zzz'))).toBe(Infinity)
  })

  it('can disable substring matches for short autocomplete queries', () => {
    expect(
      scoreSearchKey('Solo Leveling', normalizeSearchKey('a'), {
        allowSubstring: false,
      }),
    ).toBe(Infinity)
    expect(
      scoreSearchKey('Solo Leveling', normalizeSearchKey('solo'), {
        allowSubstring: false,
      }),
    ).toBe(1)
    expect(
      scoreSearchKey('God of High School', normalizeSearchKey('high'), {
        allowSubstring: false,
      }),
    ).toBe(Infinity)
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
    makeManhwa({
      id: 11,
      title: {
        english: 'Solo Leveling',
        romaji: 'Ore dake Level Up na Ken',
        native: null,
      },
      synonyms: ['Only I Level Up'],
    }),
    makeManhwa({
      id: 12,
      title: {
        english: 'Absolute Regression',
        romaji: null,
        native: null,
      },
      synonyms: [],
    }),
  ]

  it('matches titles ignoring hyphens and spaces', () => {
    expect(searchManhwa(pool, 'God of High-School')[0]?.manhwa.id).toBe(10)
    expect(searchManhwa(pool, 'godofhighschool')[0]?.manhwa.id).toBe(10)
  })

  it('keeps short queries prefix-only so mid-title letters do not flood results', () => {
    const oneChar = searchManhwa(pool, 'a')
    expect(oneChar.map((h) => h.manhwa.id)).toEqual([12])
    expect(oneChar.some((h) => h.manhwa.id === 11)).toBe(false)

    // 3 chars is still under the substring gate
    expect(searchManhwa(pool, 'igh').map((h) => h.manhwa.id)).toEqual([])
  })

  it('allows substring matches once the query is long enough', () => {
    expect(searchManhwa(pool, 'high')[0]?.manhwa.id).toBe(10)
    expect(searchManhwa(pool, 'level')[0]?.manhwa.id).toBe(11)
  })

  it('still surfaces alias prefix hits on short queries', () => {
    expect(searchManhwa(pool, 'on')[0]?.manhwa.id).toBe(11)
  })

  it('mirrors the matched alias as the dropdown label', () => {
    const hit = searchManhwa(pool, 'on')[0]
    expect(hit?.matchedAlias).toBe(true)
    expect(hit?.label).toBe('Only I Level Up')

    const primary = searchManhwa(pool, 'solo')[0]
    expect(primary?.matchedAlias).toBe(false)
    expect(primary?.label).toBe('Solo Leveling')
  })

  it('finds possessive aliases without requiring the apostrophe', () => {
    const withPossessive = [
      makeManhwa({
        id: 129579,
        title: {
          english: 'Doctor, Live Again',
          romaji: 'Uiwon, Dasi Salda',
          native: null,
        },
        synonyms: ["Doctor's Rebirth"],
      }),
    ]

    const withoutApostrophe = searchManhwa(withPossessive, 'doctor rebirth')[0]
    expect(withoutApostrophe?.manhwa.id).toBe(129579)
    expect(withoutApostrophe?.matchedAlias).toBe(true)
    expect(withoutApostrophe?.label).toBe("Doctor's Rebirth")

    const withApostrophe = searchManhwa(withPossessive, "doctor's rebirth")[0]
    expect(withApostrophe?.manhwa.id).toBe(129579)
    expect(withApostrophe?.label).toBe("Doctor's Rebirth")

    // Short prefix: prefer the closer alias label over the longer primary title
    const short = searchManhwa(withPossessive, 'doctor')[0]
    expect(short?.manhwa.id).toBe(129579)
    expect(short?.label).toBe("Doctor's Rebirth")
  })
})
