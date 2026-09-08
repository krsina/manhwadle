import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeManhwa } from './testFixtures'

const maybeSingle = vi.fn()
const rpc = vi.fn()

vi.mock('./supabase', () => {
  const query = {
    eq() {
      return this
    },
    lt() {
      return this
    },
    order() {
      return this
    },
    maybeSingle: (...args: unknown[]) => maybeSingle(...args),
  }
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      from: () => ({
        select: () => query,
      }),
      rpc: (...args: unknown[]) => rpc(...args),
    },
  }
})

describe('getTodaysPuzzle', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
    rpc.mockReset()
  })

  it('uses clue-safe play state for today and binds a unique fingerprint', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const local = makeManhwa({
      id: 1,
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    const other = makeManhwa({
      id: 2,
      genres: ['Romance'],
      tags: ['School'],
      status: 'Completed',
      publisher: 'Naver',
      startDate: { year: 2019, month: null, day: null },
    })
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2099-01-01',
        mode: 'summary',
        taste: 'both',
        meta: {
          clue: {
            type: 'summary',
            blurbs: ['Opening clue.', 'Final clue.'],
          },
          fingerprint: {
            genres: ['Action'],
            tags: ['Dungeon'],
            status: 'Ongoing',
            publisher: 'WEBTOON',
            year: 2020,
          },
        },
        max_guesses: 6,
        attempt: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      [local, other],
      [local, other],
      'summary-both',
      '2099-01-01',
    )
    expect(rpc).toHaveBeenCalledWith('get_daily_play_state', {
      p_mode: 'summary',
      p_taste: 'both',
    })
    expect(maybeSingle).not.toHaveBeenCalled()
    expect(result.source).toBe('play_state')
    expect(result.answerHidden).toBe(false)
    expect(result.characterId).toBeNull()
    expect(result.rankedClueReady).toBe(true)
    expect(result.clue).toEqual({
      type: 'summary',
      blurbs: ['Opening clue.', 'Final clue.'],
    })
    expect(result.answer.id).toBe(1)
    expect(result.answer.genres).toEqual(['Action'])
  })

  it('uses guest answer_id from play state even when fingerprints collide', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const twinA = makeManhwa({
      id: 1,
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    const twinB = makeManhwa({
      id: 2,
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2099-01-05',
        mode: 'summary',
        taste: 'both',
        answer_id: 2,
        character_id: null,
        meta: {
          clue: {
            type: 'summary',
            blurbs: ['Shared fingerprint clue.'],
          },
          fingerprint: {
            genres: ['Action'],
            tags: ['Dungeon'],
            status: 'Ongoing',
            publisher: 'WEBTOON',
            year: 2020,
          },
        },
        max_guesses: 6,
        attempt: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      [twinA, twinB],
      [twinA, twinB],
      'summary-both',
      '2099-01-05',
    )
    expect(result.answerHidden).toBe(false)
    expect(result.answer.id).toBe(2)
    expect(result.rankedClueReady).toBe(true)
    expect(result.clue).toEqual({
      type: 'summary',
      blurbs: ['Shared fingerprint clue.'],
    })
  })

  it('keeps the fingerprint stub when multiple titles share the same fingerprint', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const twinA = makeManhwa({
      id: 1,
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    const twinB = makeManhwa({
      id: 2,
      genres: ['Action'],
      tags: ['Dungeon'],
      status: 'Ongoing',
      publisher: 'WEBTOON',
      startDate: { year: 2020, month: null, day: null },
    })
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2099-01-05',
        mode: 'summary',
        taste: 'both',
        // Authenticated / pre-migration: no top-level answer_id
        answer_id: null,
        character_id: null,
        meta: {
          clue: {
            type: 'summary',
            blurbs: ['Shared fingerprint clue.'],
          },
          fingerprint: {
            genres: ['Action'],
            tags: ['Dungeon'],
            status: 'Ongoing',
            publisher: 'WEBTOON',
            year: 2020,
          },
        },
        max_guesses: 6,
        attempt: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      [twinA, twinB],
      [twinA, twinB],
      'summary-both',
      '2099-01-05',
    )
    expect(result.answerHidden).toBe(true)
    expect(result.answer.id).toBe(0)
    expect(result.rankedClueReady).toBe(true)
  })

  it('does not expose Character ids before terminal state', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const pool = [makeManhwa({ id: 1 }), makeManhwa({ id: 2 })]
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2099-01-04',
        mode: 'character',
        taste: 'both',
        meta: {
          clue: {
            type: 'character',
            image_url: 'https://example.com/opaque-clue.jpg',
            focus_x: 50,
            focus_y: 28,
          },
          fingerprint: {
            genres: ['Drama'],
            tags: [],
            status: 'Completed',
            publisher: '',
            year: 2021,
          },
        },
        max_guesses: 6,
        attempt: {
          date_key: '2099-01-04',
          mode: 'character',
          taste: 'both',
          hard_mode: false,
          hints_used: 0,
          guess_ids: [],
          guess_count: 0,
          max_guesses: 6,
          status: 'active',
          character_id: null,
          meta: {
            clue: {
              type: 'character',
              image_url: 'https://example.com/opaque-clue.jpg',
            },
            fingerprint: {},
          },
          answer_id: null,
          finalized_at: null,
        },
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'character',
      'both',
      pool,
      pool,
      'character-both',
      '2099-01-04',
    )
    expect(result.answer.id).toBe(0)
    expect(result.characterId).toBeNull()
    expect(result.clue).not.toHaveProperty('character_id')
    expect(result.meta).not.toHaveProperty('eligible_character_ids')
  })

  it('reveals terminal attempt answer_id from play state', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const local = makeManhwa({ id: 1 })
    const remote = makeManhwa({ id: 2 })
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2099-01-02',
        mode: 'cover',
        taste: 'action',
        character_id: null,
        meta: null,
        max_guesses: 6,
        attempt: {
          date_key: '2099-01-02',
          mode: 'cover',
          taste: 'action',
          hard_mode: false,
          hints_used: 0,
          guess_ids: [2],
          guess_count: 1,
          max_guesses: 6,
          status: 'won',
          character_id: null,
          meta: null,
          answer_id: 2,
          finalized_at: '2099-01-02T00:00:00Z',
        },
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'cover',
      'action',
      [local, remote],
      [local, remote],
      'cover-action',
      '2099-01-02',
    )
    expect(result.source).toBe('play_state')
    expect(result.answerHidden).toBe(false)
    expect(result.answer.id).toBe(2)
    expect(result.attempt).toMatchObject({
      status: 'won',
      guessIds: [2],
      answerId: 2,
    })
  })

  it('falls back to local when play-state RPC is missing', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const pool = [makeManhwa({ id: 1 }), makeManhwa({ id: 2 })]
    rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'Could not find the function public.get_daily_play_state in the schema cache',
      },
    })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      pool,
      pool,
      'summary-both',
      '2099-01-03',
    )
    expect(result.source).toBe('local')
    expect(result.answerHidden).toBe(true)
    expect(result.migrationMissing).toBe(true)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('uses remote archive SELECT when date_key is past', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const local = makeManhwa({ id: 1 })
    const remote = makeManhwa({ id: 2 })
    maybeSingle.mockResolvedValue({
      data: {
        date_key: '2026-07-15',
        mode: 'summary',
        taste: 'both',
        answer_id: 2,
        character_id: null,
        meta: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      [local, remote],
      [local, remote],
      'summary-both',
      '2026-07-15',
    )
    expect(rpc).not.toHaveBeenCalled()
    expect(result.source).toBe('remote')
    expect(result.answerHidden).toBe(false)
    expect(result.answer.id).toBe(2)
  })

  it('falls back to local when archive answer is outside the playable pool', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const playable = [makeManhwa({ id: 1 })]
    const fallback = [makeManhwa({ id: 1 }), makeManhwa({ id: 2 })]
    maybeSingle.mockResolvedValue({
      data: {
        date_key: '2026-07-10',
        mode: 'character',
        taste: 'action',
        answer_id: 2,
        character_id: 99,
        meta: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'character',
      'action',
      playable,
      fallback,
      'character-action',
      '2026-07-10',
    )
    expect(result.source).toBe('local')
    expect(result.answer.id).toBe(1)
    expect(result.characterId).toBeNull()
  })
})
