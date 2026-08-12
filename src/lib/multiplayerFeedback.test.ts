import { describe, expect, it } from 'vitest'
import { makeManhwa } from './testFixtures'
import {
  buildMultiplayerFeedbackRows,
  resolveMultiplayerDisplayLabel,
} from './multiplayerFeedback'

describe('resolveMultiplayerDisplayLabel', () => {
  it('keeps real titles and drops id fallbacks', () => {
    expect(resolveMultiplayerDisplayLabel('Solo Leveling', 42)).toBe('Solo Leveling')
    expect(resolveMultiplayerDisplayLabel('#42', 42)).toBeUndefined()
    expect(resolveMultiplayerDisplayLabel('Title 42', 42)).toBeUndefined()
    expect(resolveMultiplayerDisplayLabel('  ', 42)).toBeUndefined()
  })
})

describe('buildMultiplayerFeedbackRows', () => {
  it('combines server comparison results with public guessed-title data', () => {
    const guess = makeManhwa({
      id: 42,
      genres: ['Action'],
      tags: ['Dungeon'],
      publisher: 'WEBTOON',
      status: 'Ongoing',
      startDate: { year: 2020, month: null, day: null },
    })

    const rows = buildMultiplayerFeedbackRows(
      [{
        guess_id: 42,
        is_correct: false,
        display_label: 'Tower Climber',
        genres: { tone: 'close', shared: ['Action'] },
        year: { tone: 'close', direction: 'up' },
        status: { tone: 'incorrect' },
        publisher: { tone: 'correct' },
        tags: { tone: 'close', shared: ['Dungeon'] },
      }],
      [42],
      [guess],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      manhwa: { id: 42 },
      isCorrect: false,
      displayLabel: 'Tower Climber',
      genres: { tone: 'close', shared: ['Action'] },
      year: { direction: 'up', year: 2020 },
      publisher: { tone: 'correct', publisher: 'WEBTOON' },
      tags: { shared: ['Dungeon'], sharedCount: 1 },
    })
  })

  it('ignores server #id display labels so the catalog title can show', () => {
    const guess = makeManhwa({
      id: 42,
      title: { romaji: 'Omniscient Reader', english: null, native: null },
    })

    const rows = buildMultiplayerFeedbackRows(
      [{ guess_id: 42, display_label: '#42', is_correct: false }],
      [42],
      [guess],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].displayLabel).toBeUndefined()
  })

  it('drops feedback for guesses missing from the public catalog', () => {
    expect(
      buildMultiplayerFeedbackRows([{ guess_id: 99 }], [99], []),
    ).toEqual([])
  })
})
