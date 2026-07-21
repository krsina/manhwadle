import { describe, expect, it } from 'vitest'
import { classifyManhwaTaste, filterPoolByTaste } from './readerTaste'
import { makeManhwa } from './testFixtures'

describe('filterPoolByTaste', () => {
  const action = makeManhwa({
    id: 1,
    genres: ['Action', 'Fantasy'],
    tags: ['Isekai'],
  })
  const romance = makeManhwa({
    id: 2,
    genres: ['Romance', 'Drama'],
    tags: ['School'],
  })
  const pool = [action, romance]

  it('keeps the full pool for both', () => {
    expect(filterPoolByTaste(pool, 'both')).toHaveLength(2)
  })

  it('filters action and romance lanes', () => {
    expect(filterPoolByTaste(pool, 'action').map((m) => m.id)).toEqual([1])
    expect(filterPoolByTaste(pool, 'romance').map((m) => m.id)).toEqual([2])
  })
})

describe('classifyManhwaTaste overrides', () => {
  it('forces Archvillain Daughter-In-Law to romance', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 145177,
          genres: ['Fantasy', 'Romance'],
          tags: ['Isekai', 'Female Protagonist'],
        }),
      ),
    ).toBe('romance')
  })

  it('forces Teenage Mercenary to action', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 126297,
          genres: ['Action', 'Drama'],
          tags: ['Male Protagonist', 'School'],
        }),
      ),
    ).toBe('action')
  })

  it('routes Fantasy+Romance female-lead otome to romance even with Action genre', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 999001,
          genres: ['Action', 'Fantasy', 'Romance'],
          tags: ['Female Protagonist', 'Isekai', 'Royal Affairs'],
        }),
      ),
    ).toBe('romance')
  })

  it('keeps masculine Action+Romance with male lead on action', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 999002,
          genres: ['Action', 'Fantasy', 'Romance'],
          tags: ['Male Protagonist', 'Isekai', 'Martial Arts'],
        }),
      ),
    ).toBe('action')
  })

  it('forces The Breaker New Waves to action despite Romance genre', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 52651,
          genres: ['Action', 'Comedy', 'Drama', 'Romance'],
          tags: ['Martial Arts', 'Gangs'],
        }),
      ),
    ).toBe('action')
  })

  it('forces Lookism and Wind Breaker to action', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 86848,
          genres: ['Action', 'Comedy', 'Drama', 'Supernatural'],
          tags: ['School', 'Coming of Age', 'Heterosexual', 'Male Protagonist'],
        }),
      ),
    ).toBe('action')
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 86099,
          genres: ['Action', 'Comedy', 'Drama', 'Romance', 'Sports'],
          tags: ['School', 'Coming of Age', 'Male Protagonist'],
        }),
      ),
    ).toBe('action')
  })

  it('forces Existence to action', () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 153987,
          genres: ['Drama', 'Supernatural'],
          tags: ['Male Protagonist', 'Super Power', 'Tragedy'],
        }),
      ),
    ).toBe('action')
  })

  it("forces A Man's Man to action", () => {
    expect(
      classifyManhwaTaste(
        makeManhwa({
          id: 129956,
          genres: ['Drama'],
          tags: ['Male Protagonist', 'Age Regression', 'Work'],
        }),
      ),
    ).toBe('action')
  })
})
