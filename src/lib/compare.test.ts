import { describe, expect, it } from 'vitest'
import {
  buildShareText,
  compareGuess,
  comparePublisher,
  compareTitleKeywords,
  compareYear,
  formatGuessScore,
  isCompleteMiss,
} from './compare'
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

  it('finds title keyword matches without case or punctuation sensitivity', () => {
    const answer = makeManhwa({
      id: 1,
      title: { english: 'Regression Warrior Mage', romaji: null, native: null },
    })

    expect(compareTitleKeywords('MAGE: regression protocol', answer)).toEqual([
      'mage',
      'regression',
    ])
    expect(compareTitleKeywords('Solo Leveling', answer)).toEqual([])
  })

  it('checks the selected guess alias against all known answer titles', () => {
    const answer = makeManhwa({
      id: 1,
      title: { english: 'Regression Warrior Mage', romaji: null, native: null },
      synonyms: ['The Arcane Warrior'],
    })
    const guess = makeManhwa({ id: 2 })
    const feedback = compareGuess(guess, answer, 'Arcane Return')

    expect(feedback.displayLabel).toBe('Arcane Return')
    expect(feedback.titleKeywordMatches).toEqual(['arcane'])
  })

  it('detects a complete miss when every feedback tile is incorrect', () => {
    const answer = makeManhwa({
      id: 1,
      genres: ['Action', 'Fantasy'],
      tags: ['Isekai'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    const totalMiss = makeManhwa({
      id: 2,
      genres: ['Romance'],
      tags: ['School'],
      status: 'Completed',
      publisher: 'Tapas',
      startDate: { year: 2010, month: null, day: null },
    })
    const genreOnlyMiss = makeManhwa({
      id: 3,
      genres: ['Romance'],
      tags: ['Isekai'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    expect(isCompleteMiss(compareGuess(totalMiss, answer))).toBe(true)
    expect(isCompleteMiss(compareGuess(genreOnlyMiss, answer))).toBe(false)
    expect(isCompleteMiss(compareGuess(answer, answer))).toBe(false)
  })
})

describe('formatGuessScore / buildShareText', () => {
  it('appends free hint count when used', () => {
    expect(
      formatGuessScore({
        won: true,
        guessCount: 3,
        maxGuesses: 6,
        hintsUsed: 2,
      }),
    ).toBe('3/6 · 2 hints')
    expect(
      formatGuessScore({
        won: true,
        guessCount: 1,
        maxGuesses: 6,
        hardMode: true,
        hintsUsed: 1,
      }),
    ).toBe('1/6* · 1 hint')
  })

  it('includes hints in the share header', () => {
    const text = buildShareText({
      appName: 'Manhwadle',
      modeLabel: 'Summary',
      tasteLabel: 'Both',
      dateKey: '2026-07-17',
      guessCount: 4,
      maxGuesses: 6,
      won: true,
      lines: ['🟩'],
      hintsUsed: 2,
      siteUrl: 'https://example.com',
    })
    expect(text.split('\n')[0]).toContain('4/6 · 2 hints')
  })
})
