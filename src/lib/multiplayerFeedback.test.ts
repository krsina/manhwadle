import { describe, expect, it } from 'vitest'
import { makeManhwa } from './testFixtures'
import { buildMultiplayerFeedbackRows } from './multiplayerFeedback'

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
      genres: { tone: 'close', shared: ['Action'] },
      year: { direction: 'up', year: 2020 },
      publisher: { tone: 'correct', publisher: 'WEBTOON' },
      tags: { shared: ['Dungeon'], sharedCount: 1 },
    })
  })

  it('drops feedback for guesses missing from the public catalog', () => {
    expect(
      buildMultiplayerFeedbackRows([{ guess_id: 99 }], [99], []),
    ).toEqual([])
  })
})
