import { describe, expect, it } from 'vitest'
import { compareGuess, comparePublisher, compareYear } from './compare'
import { makeManhwa } from './testFixtures'

describe('compareGuess', () => {
  it('marks all fields correct on exact id match', () => {
    const answer = makeManhwa({
      id: 1,
      genres: ['Action'],
      tags: ['Isekai'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2021, month: null, day: null },
    })
    const feedback = compareGuess(answer, answer)
    expect(feedback.isCorrect).toBe(true)
    expect(feedback.genres.tone).toBe('correct')
    expect(feedback.year.tone).toBe('correct')
    expect(feedback.status.tone).toBe('correct')
    expect(feedback.publisher.tone).toBe('correct')
    expect(feedback.tags.tone).toBe('correct')
  })

  it('marks shared genres as close and disjoint as incorrect', () => {
    const answer = makeManhwa({ id: 1, genres: ['Action', 'Fantasy'] })
    const close = makeManhwa({ id: 2, genres: ['Action', 'Romance'] })
    const miss = makeManhwa({ id: 3, genres: ['Romance'] })
    expect(compareGuess(close, answer).genres.tone).toBe('close')
    expect(compareGuess(miss, answer).genres.tone).toBe('incorrect')
  })

  it('compares years with direction', () => {
    const answer = makeManhwa({
      id: 1,
      startDate: { year: 2020, month: null, day: null },
    })
    const earlier = makeManhwa({
      id: 2,
      startDate: { year: 2018, month: null, day: null },
    })
    const later = makeManhwa({
      id: 3,
      startDate: { year: 2022, month: null, day: null },
    })
    expect(compareYear(earlier, answer).direction).toBe('up')
    expect(compareYear(later, answer).direction).toBe('down')
    expect(compareGuess(earlier, answer).year.tone).toBe('close')
  })

  it('compares publisher as exact match only', () => {
    const answer = makeManhwa({ id: 1, publisher: 'WEBTOON' })
    const same = makeManhwa({ id: 2, publisher: 'webtoon' })
    const miss = makeManhwa({ id: 3, publisher: 'Tapas' })
    expect(comparePublisher(same, answer).tone).toBe('correct')
    expect(compareGuess(same, answer).publisher.tone).toBe('correct')
    expect(compareGuess(miss, answer).publisher.tone).toBe('incorrect')
    expect(compareGuess(miss, answer).publisher.publisher).toBe('Tapas')
  })
})
