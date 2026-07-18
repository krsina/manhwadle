import { describe, expect, it } from 'vitest'
import {
  MODES,
  TASTES,
  buildRows,
  manhwaHasVocalSong,
} from './puzzle-pools.mjs'

describe('puzzle pool lane generation', () => {
  it('exposes 4 modes × 3 tastes (12 ensure_daily_puzzles lanes)', () => {
    expect(MODES).toEqual(['summary', 'character', 'cover', 'heardle'])
    expect(TASTES).toEqual(['action', 'romance', 'both'])
    expect(MODES.length * TASTES.length).toBe(12)
  })

  it('buildRows emits contiguous positions per lane and heardle-only vocal titles', () => {
    const manhwa = [
      {
        id: 1,
        genres: ['Action'],
        tags: ['Male Protagonist'],
        coverImage: 'https://example.com/a.jpg',
        characters: [
          {
            id: 10,
            useForGuess: true,
            image: { large: 'https://example.com/c.jpg' },
          },
        ],
      },
      {
        id: 2,
        genres: ['Romance'],
        tags: ['Female Protagonist'],
        coverImage: 'https://example.com/b.jpg',
        characters: [],
      },
    ]
    // songs.json drives vocal eligibility; fixture ids may or may not be present.
    const blurbIds = new Set([1, 2])
    const cropIds = new Set()
    const rows = buildRows(manhwa, blurbIds, cropIds)

    for (const mode of MODES) {
      for (const taste of TASTES) {
        const lane = rows.filter((r) => r.mode === mode && r.taste === taste)
        const positions = lane.map((r) => r.position).sort((a, b) => a - b)
        expect(positions).toEqual([...Array(positions.length).keys()])
      }
    }

    for (const row of rows.filter((r) => r.mode === 'heardle')) {
      const title = manhwa.find((m) => m.id === row.manhwa_id)
      expect(title).toBeTruthy()
      expect(manhwaHasVocalSong(title)).toBe(true)
    }
  })

  it('uses SQL-compatible seed prefixes for mode/taste lanes', () => {
    for (const mode of MODES) {
      for (const taste of TASTES) {
        expect(`manhwadle:${mode}:${taste}`).toMatch(
          /^manhwadle:(summary|character|cover|heardle):(action|romance|both)$/,
        )
      }
    }
  })
})
