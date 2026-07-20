import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompleteDailyModePayload,
  DAILY_MAX_GUESSES,
  isSurrenderedLoss,
  rankedSubmissionKey,
  resetRankedSubmissionCache,
  shouldSubmitRankedCompletion,
  submitBonusNameReward,
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
        point_delta: 100,
        play_point_delta: 100,
        points_balance: 110,
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
      expect(first.pointDelta).toBe(100)
      expect(first.playPointDelta).toBe(100)
      expect(first.pointsBalance).toBe(110)
    }
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('complete_daily_mode_with_reward', {
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
        point_delta: 0,
        play_point_delta: 0,
        points_balance: 0,
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

  it('falls back to the original completion RPC during rolling deploys', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'Could not find the function public.complete_daily_mode_with_reward in the schema cache',
        },
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          inserted: true,
          date_key: '2026-07-18',
          mode: 'cover',
          taste: 'action',
          outcome: 'won',
          guess_count: 1,
          surrendered: false,
        },
        error: null,
      })

    const result = await submitVerifiedDailyCompletion({
      userId: 'user-rolling',
      isPractice: false,
      isArchive: false,
      mode: 'cover',
      taste: 'action',
      guessIds: [42],
      surrendered: false,
      dateKey: '2026-07-18',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.pointDelta).toBe(0)
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'complete_daily_mode_with_reward',
      'complete_daily_mode',
    ])
  })

  it('submits bonus-name XP only for a correct first-try', async () => {
    expect(
      await submitBonusNameReward({
        userId: 'user-bonus',
        isPractice: false,
        isArchive: false,
        mode: 'character',
        taste: 'both',
        correct: false,
        firstTry: true,
        dateKey: '2026-07-18',
      }),
    ).toEqual({ status: 'skipped', reason: 'incorrect' })

    expect(
      await submitBonusNameReward({
        userId: 'user-bonus',
        isPractice: false,
        isArchive: false,
        mode: 'character',
        taste: 'both',
        correct: true,
        firstTry: false,
        dateKey: '2026-07-18',
      }),
    ).toEqual({ status: 'skipped', reason: 'not_first_try' })

    rpc.mockResolvedValue({
      data: {
        ok: true,
        applied: true,
        date_key: '2026-07-18',
        mode: 'character',
        taste: 'both',
        point_delta: 3,
        play_point_delta: 3,
        points_balance: 25,
      },
      error: null,
    })

    const awarded = await submitBonusNameReward({
      userId: 'user-bonus',
      isPractice: false,
      isArchive: false,
      mode: 'character',
      taste: 'both',
      correct: true,
      firstTry: true,
      dateKey: '2026-07-18',
    })
    expect(awarded).toEqual({
      status: 'ok',
      applied: true,
      dateKey: '2026-07-18',
      mode: 'character',
      taste: 'both',
      pointDelta: 3,
      playPointDelta: 3,
      pointsBalance: 25,
    })
    expect(rpc).toHaveBeenCalledWith('complete_bonus_name_with_reward', {
      p_mode: 'character',
      p_taste: 'both',
      p_correct: true,
    })

    const dup = await submitBonusNameReward({
      userId: 'user-bonus',
      isPractice: false,
      isArchive: false,
      mode: 'character',
      taste: 'both',
      correct: true,
      firstTry: true,
      dateKey: '2026-07-18',
    })
    expect(dup).toEqual({ status: 'skipped', reason: 'duplicate' })
  })
})
