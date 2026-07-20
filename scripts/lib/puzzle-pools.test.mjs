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
            role: 'MAIN',
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

  it('character lanes keep ids private and emit opaque clue candidates', () => {
    const manhwa = [
      {
        id: 1,
        genres: ['Action'],
        tags: ['Male Protagonist'],
        coverImage: 'https://example.com/a.jpg',
        characters: [
          {
            id: 10,
            role: 'MAIN',
            useForGuess: true,
            name: { full: 'Hero One', alternative: ['H1'] },
            image: { large: 'https://example.com/main.jpg' },
          },
          {
            id: 11,
            role: 'SUPPORTING',
            useForGuess: true,
            name: { full: 'Sidekick' },
            image: { large: 'https://example.com/sup.jpg' },
          },
        ],
      },
      {
        id: 2,
        genres: ['Action'],
        tags: ['Male Protagonist'],
        coverImage: 'https://example.com/b.jpg',
        characters: [
          {
            id: 20,
            role: 'SUPPORTING',
            useForGuess: true,
            name: { full: 'Only Support' },
            image: { large: 'https://example.com/only-sup.jpg' },
          },
        ],
      },
    ]
    const rows = buildRows(manhwa, new Set([1, 2]), new Set([2]))
    const characterRows = rows.filter((r) => r.mode === 'character')
    expect(characterRows.map((r) => r.manhwa_id)).toEqual(
      expect.arrayContaining([1]),
    )
    expect(characterRows.every((r) => r.manhwa_id !== 2)).toBe(true)
    for (const row of characterRows.filter((r) => r.manhwa_id === 1)) {
      expect(row.meta.eligible_character_ids).toBeUndefined()
      expect(row.meta.public_clue).toBeUndefined()
      expect(row.meta.character_clues).toEqual([
        {
          character_id: 10,
          image_url: 'https://example.com/main.jpg',
          focus_x: 50,
          focus_y: 28,
        },
      ])
      expect(row.meta.bonus_character_id).toBe(10)
      expect(row.meta.bonus_name_normalized).toBe('heroone')
      expect(row.meta.bonus_name_aliases).toEqual(
        expect.arrayContaining(['Hero One', 'H1']),
      )
    }
  })

  it('writes private bonus-name metadata for non-character lanes too', () => {
    const manhwa = [
      {
        id: 1,
        genres: ['Action'],
        tags: ['Male Protagonist'],
        coverImage: 'https://example.com/a.jpg',
        characters: [
          {
            id: 10,
            role: 'MAIN',
            useForGuess: true,
            name: { full: 'Blade Master', alternative: ['BM'] },
            image: { large: 'https://example.com/c.jpg' },
          },
        ],
      },
    ]
    const rows = buildRows(manhwa, new Set([1]), new Set())
    const summary = rows.find((r) => r.mode === 'summary' && r.taste === 'action')
    expect(summary?.meta).toMatchObject({
      bonus_character_id: 10,
      bonus_name_normalized: 'blademaster',
    })
    expect(summary?.meta.character_clues).toBeUndefined()
    expect(summary?.meta.answer_fingerprint).toMatchObject({
      genres: ['Action'],
      tags: ['Male Protagonist'],
    })
  })

  it('writes clue-safe public payloads for summary and cover', () => {
    const manhwa = [
      {
        id: 1,
        description: 'Final scrubbed summary.',
        genres: ['Action'],
        tags: ['Dungeon'],
        status: 'Ongoing',
        publisher: 'WEBTOON',
        startDate: { year: 2020 },
        coverImage: 'https://example.com/cover.jpg',
        characters: [],
      },
    ]
    const blurbs = {
      entries: [
        {
          manhwaId: 1,
          storyDescriptionBlurb: { t0: 'Opening clue.', t1: 'Second clue.' },
        },
      ],
    }
    const rows = buildRows(manhwa, blurbs, { entries: [] })
    const summary = rows.find((row) => row.mode === 'summary' && row.taste === 'action')
    const cover = rows.find((row) => row.mode === 'cover' && row.taste === 'action')
    expect(summary?.meta.public_clue).toEqual({
      type: 'summary',
      blurbs: ['Opening clue.', 'Second clue.', 'Final scrubbed summary.'],
    })
    expect(cover?.meta.public_clue).toMatchObject({
      type: 'cover',
      image_url: 'https://example.com/cover.jpg',
    })
    expect(summary?.meta.answer_fingerprint).toEqual({
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      year: 2020,
    })
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
