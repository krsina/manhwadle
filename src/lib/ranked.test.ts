import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompleteDailyModePayload,
  DAILY_MAX_GUESSES,
  isSurrenderedLoss,
  rankedSubmissionKey,
  resetRankedSubmissionCache,
  shouldSubmitRankedCompletion,
  submitVerifiedDailyCompletion,
} from './ranked'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

describe('ranked completion helpers', () => {
  beforeEach(() => {
    resetRankedSubmissionCache()
    rpc.mockReset()
  })

  it('builds a normalized RPC payload', () => {
    expect(
      buildCompleteDailyModePayload({
        mode: 'summary',
        taste: 'both',
        guessIds: [10, 20, 30],
        hintsUsed: 2,
        hardMode: true,
        surrendered: false,
      }),
    ).toEqual({
      mode: 'summary',
      taste: 'both',
      guessIds: [10, 20, 30],
      hintsUsed: 2,
      hardMode: true,
      surrendered: false,
    })
  })

  it('rejects duplicate guesses and over-long surrender', () => {
    expect(() =>
      buildCompleteDailyModePayload({
        mode: 'cover',
        taste: 'action',
        guessIds: [1, 1],
        surrendered: false,
      }),
    ).toThrow(/Duplicate/)

    expect(() =>
      buildCompleteDailyModePayload({
        mode: 'cover',
        taste: 'action',
        guessIds: [1, 2, 3, 4, 5, 6],
        surrendered: true,
      }),
    ).toThrow(/Surrender/)
  })

  it('detects surrender losses and skip gates', () => {
    expect(isSurrenderedLoss('lost', 2, DAILY_MAX_GUESSES)).toBe(true)
    expect(isSurrenderedLoss('lost', 6, DAILY_MAX_GUESSES)).toBe(false)
    expect(isSurrenderedLoss('won', 1, DAILY_MAX_GUESSES)).toBe(false)

    expect(
      shouldSubmitRankedCompletion({
        userId: null,
        isPractice: false,
        isArchive: false,
        configured: true,
      }),
    ).toBe('anonymous')
    expect(
      shouldSubmitRankedCompletion({
        userId: 'u1',
        isPractice: true,
        isArchive: false,
        configured: true,
      }),
    ).toBe('practice')
    expect(
      shouldSubmitRankedCompletion({
        userId: 'u1',
        isPractice: false,
        isArchive: true,
        configured: true,
      }),
    ).toBe('archive')
    expect(
      shouldSubmitRankedCompletion({
        userId: 'u1',
        isPractice: false,
        isArchive: false,
        configured: false,
      }),
    ).toBe('unconfigured')
    expect(
      shouldSubmitRankedCompletion({
        userId: 'u1',
        isPractice: false,
        isArchive: false,
        configured: true,
      }),
    ).toBeNull()
  })

  it('submits once per user/date/mode and is idempotent client-side', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        inserted: true,
        date_key: '2026-07-18',
        mode: 'heardle',
        taste: 'romance',
        outcome: 'won',
        guess_count: 2,
        surrendered: false,
      },
      error: null,
    })

    const input = {
      userId: 'user-1',
      isPractice: false,
      isArchive: false,
      mode: 'heardle' as const,
      taste: 'romance' as const,
      guessIds: [5, 9],
      hintsUsed: 1,
      hardMode: false,
      surrendered: false,
      dateKey: '2026-07-18',
    }

    const first = await submitVerifiedDailyCompletion(input)
    expect(first.status).toBe('ok')
    if (first.status === 'ok') {
      expect(first.inserted).toBe(true)
      expect(first.outcome).toBe('won')
    }
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('complete_daily_mode', {
      p_mode: 'heardle',
      p_taste: 'romance',
      p_guess_ids: [5, 9],
      p_hints_used: 1,
      p_hard_mode: false,
      p_surrendered: false,
    })

    const second = await submitVerifiedDailyCompletion(input)
    expect(second).toEqual({ status: 'skipped', reason: 'duplicate' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rankedSubmissionKey('user-1', 'heardle', '2026-07-18')).toBe(
      'user-1:2026-07-18:heardle',
    )
  })

  it('returns a structured warning when the RPC fails', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Daily puzzle unavailable for mode/taste' },
    })

    const result = await submitVerifiedDailyCompletion({
      userId: 'user-2',
      isPractice: false,
      isArchive: false,
      mode: 'summary',
      taste: 'both',
      guessIds: [1, 2, 3, 4, 5, 6],
      surrendered: false,
      dateKey: '2026-07-18',
    })

    expect(result).toEqual({
      status: 'error',
      warning: 'ranked_rpc_failed',
      message: 'Daily puzzle unavailable for mode/taste',
    })

    // Failed attempt should not stick in the dedupe cache.
    rpc.mockResolvedValue({
      data: {
        ok: true,
        inserted: true,
        date_key: '2026-07-18',
        mode: 'summary',
        taste: 'both',
        outcome: 'lost',
        guess_count: 6,
        surrendered: false,
      },
      error: null,
    })
    const retry = await submitVerifiedDailyCompletion({
      userId: 'user-2',
      isPractice: false,
      isArchive: false,
      mode: 'summary',
      taste: 'both',
      guessIds: [1, 2, 3, 4, 5, 6],
      surrendered: false,
      dateKey: '2026-07-18',
    })
    expect(retry.status).toBe('ok')
  })
})
