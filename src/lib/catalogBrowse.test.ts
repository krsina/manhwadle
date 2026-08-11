import { describe, expect, it } from 'vitest'
import {
  catalogRank,
  catalogTileMeta,
  matchesCatalogQuery,
  sortCatalogByRank,
} from './catalogBrowse'
import { makeManhwa } from './testFixtures'

describe('matchesCatalogQuery', () => {
  const solo = makeManhwa({
    id: 1,
    title: { english: 'Solo Leveling', romaji: 'Na Honjaman Level Up', native: null },
    synonyms: ['Only I Level Up'],
  })

  it('keeps everything for an empty query', () => {
    expect(matchesCatalogQuery(solo, '   ')).toBe(true)
  })

  it('matches romaji and synonyms, not unrelated titles', () => {
    expect(matchesCatalogQuery(solo, 'honjaman')).toBe(true)
    expect(matchesCatalogQuery(solo, 'only i level')).toBe(true)
    expect(matchesCatalogQuery(solo, 'tower of god')).toBe(false)
  })
})

describe('sortCatalogByRank', () => {
  it('orders ranked titles first and breaks ties alphabetically', () => {
    const ranked = makeManhwa({ id: 1, rank: 4 })
    const topRanked = makeManhwa({ id: 2, rank: 1 })
    const unrankedB = makeManhwa({
      id: 3,
      title: { english: 'Beta', romaji: null, native: null },
    })
    const unrankedA = makeManhwa({
      id: 4,
      title: { english: 'Alpha', romaji: null, native: null },
    })

    expect(
      sortCatalogByRank([ranked, unrankedB, topRanked, unrankedA]).map((m) => m.id),
    ).toEqual([2, 1, 4, 3])
  })

  it('treats missing or zero ranks as unranked', () => {
    expect(catalogRank(makeManhwa({ id: 1, rank: 0 }))).toBeNull()
    expect(catalogRank(makeManhwa({ id: 2, rank: 7 }))).toBe(7)
  })
})

describe('catalogTileMeta', () => {
  it('drops blank publishers and missing years', () => {
    expect(
      catalogTileMeta(
        makeManhwa({ id: 1, publisher: 'WEBTOON', startDate: { year: 2019, month: null, day: null } }),
      ),
    ).toEqual(['WEBTOON', '2019'])
    expect(
      catalogTileMeta(
        makeManhwa({
          id: 2,
          publisher: '',
          startDate: { year: null, month: null, day: null },
        }),
      ),
    ).toEqual([])
  })
})
