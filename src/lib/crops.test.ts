import { describe, expect, it } from 'vitest'
import {
  cropZoomScale,
  guessableCharacters,
  resolveDailyCharacterCrop,
} from './crops'
import { makeCharacter, makeManhwa } from './testFixtures'

describe('crops', () => {
  it('guessableCharacters skips disabled and imageless cast', () => {
    const manhwa = makeManhwa({
      id: 10,
      characters: [
        makeCharacter({ id: 1 }),
        makeCharacter({ id: 2, useForGuess: false }),
        makeCharacter({
          id: 3,
          image: { large: null, medium: null },
        }),
      ],
    })
    expect(guessableCharacters(manhwa).map((c) => c.id)).toEqual([1])
  })

  it('cropZoomScale ends at 1x by the last failed guess and when finished', () => {
    expect(cropZoomScale(0)).toBeGreaterThan(1)
    expect(cropZoomScale(5)).toBe(1)
    expect(cropZoomScale(0, { finished: true })).toBe(1)
  })

  it('resolveDailyCharacterCrop prefers a saved crop URL', () => {
    const manhwa = makeManhwa({
      id: 99,
      characters: [makeCharacter({ id: 500 })],
    })
    const crop = resolveDailyCharacterCrop(manhwa, '2026-07-15', 'character', [
      {
        manhwaId: 99,
        characterId: 500,
        imageUrl: 'https://example.com/crop.jpg',
        focusX: 40,
        focusY: 30,
      },
    ])
    expect(crop?.characterId).toBe(500)
    expect(crop?.imageUrl).toBe('https://example.com/crop.jpg')
    expect(crop?.focusX).toBe(40)
  })
})
