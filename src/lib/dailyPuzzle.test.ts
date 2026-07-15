import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeManhwa } from './testFixtures'

const maybeSingle = vi.fn()

vi.mock('./supabase', () => {
  const query = {
    eq() {
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
    },
  }
})

describe('getTodaysPuzzle', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('uses remote answer when present in the catalog', async () => {
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
    expect(result.source).toBe('remote')
    expect(result.answer.id).toBe(2)
  })

  it('falls back to local when remote row is missing', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const pool = [makeManhwa({ id: 1 }), makeManhwa({ id: 2 })]
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await getTodaysPuzzle(
      'summary',
      'both',
      pool,
      pool,
      'summary-both',
      '2026-07-15',
    )
    expect(result.source).toBe('local')
    expect(pool.map((m) => m.id)).toContain(result.answer.id)
  })

  it('falls back to local when remote answer_id is unknown', async () => {
    const { getTodaysPuzzle } = await import('./dailyPuzzle')
    const pool = [makeManhwa({ id: 1 }), makeManhwa({ id: 2 })]
    maybeSingle.mockResolvedValue({
      data: {
        date_key: '2026-07-15',
        mode: 'cover',
        taste: 'action',
        answer_id: 999999,
        character_id: null,
        meta: null,
      },
      error: null,
    })

    const result = await getTodaysPuzzle(
      'cover',
      'action',
      pool,
      pool,
      'cover-action',
      '2026-07-15',
    )
    expect(result.source).toBe('local')
  })
})
