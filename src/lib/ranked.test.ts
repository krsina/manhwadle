import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompleteDailyModePayload,
  DAILY_MAX_GUESSES,
  isSurrenderedLoss,
  rankedSubmissionKey,
  resetRankedSubmissionCache,
  shouldSubmitRankedCompletion,
  shouldUseServerRankedAttempt,
  submitBonusNameReward,
  submitRankedDailyGuess,
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
    expect(
      shouldUseServerRankedAttempt({
        userId: 'u1',
        isPractice: false,
        isArchive: false,
        configured: true,
      }),
    ).toBe(true)
  })

  it('finalizes via server attempt and never calls forgeable completion RPCs', async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          ok: true,
          created: true,
          already_completed: false,
          attempt: {
            date_key: '2026-07-18',
            mode: 'heardle',
            taste: 'romance',
            hard_mode: false,
            hints_used: 1,
            guess_ids: [5, 9],
            guess_count: 2,
            max_guesses: 6,
            status: 'active',
            character_id: null,
            meta: null,
            answer_id: null,
            finalized_at: null,
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          finalized: true,
          already_terminal: false,
          attempt: {
            date_key: '2026-07-18',
            mode: 'heardle',
            taste: 'romance',
            hard_mode: false,
            hints_used: 1,
            guess_ids: [5, 9],
            guess_count: 2,
            max_guesses: 6,
            status: 'won',
            character_id: null,
            meta: null,
            answer_id: 9,
            finalized_at: '2026-07-18T01:00:00Z',
          },
          completion: {
            ok: true,
            inserted: true,
            date_key: '2026-07-18',
            mode: 'heardle',
            taste: 'romance',
            outcome: 'won',
            guess_count: 2,
            hints_used: 1,
            hard_mode: false,
            surrendered: false,
            answer_id: 9,
            character_id: null,
            completed_at: '2026-07-18T01:00:00Z',
            point_delta: 100,
            play_point_delta: 100,
            points_balance: 110,
          },
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
      expect(first.answerId).toBe(9)
    }
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'start_daily_attempt',
      'finalize_daily_attempt',
    ])
    expect(
      rpc.mock.calls.some(([name]) =>
        String(name).startsWith('complete_daily_mode'),
      ),
    ).toBe(false)

    const second = await submitVerifiedDailyCompletion(input)
    expect(second).toEqual({ status: 'skipped', reason: 'duplicate' })
    expect(rankedSubmissionKey('user-1', 'heardle', '2026-07-18')).toBe(
      'user-1:2026-07-18:heardle',
    )
  })

  it('skips ranked when attempt RPCs are missing (no forgeable fallback)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'Could not find the function public.start_daily_attempt in the schema cache',
      },
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

    expect(result).toEqual({ status: 'skipped', reason: 'migration_missing' })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['start_daily_attempt'])
    expect(
      rpc.mock.calls.some(([name]) =>
        String(name).includes('complete_daily_mode'),
      ),
    ).toBe(false)
  })

  it('submits ranked guesses through submit_daily_guess', async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          ok: true,
          created: true,
          already_completed: false,
          attempt: {
            date_key: '2026-07-18',
            mode: 'summary',
            taste: 'both',
            hard_mode: false,
            hints_used: 0,
            guess_ids: [],
            guess_count: 0,
            max_guesses: 6,
            status: 'active',
            character_id: null,
            meta: null,
            answer_id: null,
            finalized_at: null,
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          accepted: true,
          correct: true,
          guess_id: 7,
          guess_count: 1,
          finalized: true,
          attempt: {
            date_key: '2026-07-18',
            mode: 'summary',
            taste: 'both',
            hard_mode: false,
            hints_used: 0,
            guess_ids: [7],
            guess_count: 1,
            max_guesses: 6,
            status: 'won',
            character_id: null,
            meta: null,
            answer_id: 7,
            finalized_at: '2026-07-18T02:00:00Z',
          },
          completion: {
            ok: true,
            inserted: true,
            date_key: '2026-07-18',
            mode: 'summary',
            taste: 'both',
            outcome: 'won',
            guess_count: 1,
            hints_used: 0,
            hard_mode: false,
            surrendered: false,
            answer_id: 7,
            character_id: null,
            completed_at: '2026-07-18T02:00:00Z',
            point_delta: 50,
            play_point_delta: 50,
            points_balance: 50,
          },
        },
        error: null,
      })

    const result = await submitRankedDailyGuess({
      userId: 'user-guess',
      isPractice: false,
      isArchive: false,
      mode: 'summary',
      taste: 'both',
      guessId: 7,
      dateKey: '2026-07-18',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.correct).toBe(true)
      expect(result.finalized).toBe(true)
      expect(result.answerId).toBe(7)
      expect(result.completion?.pointDelta).toBe(50)
    }
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'start_daily_attempt',
      'submit_daily_guess',
    ])
  })

  it('submits bonus-name XP with guessed character payload', async () => {
    expect(
      await submitBonusNameReward({
        userId: 'user-bonus',
        isPractice: false,
        isArchive: false,
        mode: 'character',
        taste: 'both',
        correct: false,
        firstTry: true,
        guessedCharacterId: 10,
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
        guessedCharacterId: 10,
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
      guessedCharacterId: 10,
      guessLabel: 'Hero Name',
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
      reason: undefined,
    })
    expect(rpc).toHaveBeenCalledWith('complete_bonus_name_with_reward', {
      p_mode: 'character',
      p_taste: 'both',
      p_guessed_character_id: 10,
      p_guess_label: 'Hero Name',
    })
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_correct')

    const dup = await submitBonusNameReward({
      userId: 'user-bonus',
      isPractice: false,
      isArchive: false,
      mode: 'character',
      taste: 'both',
      correct: true,
      firstTry: true,
      guessedCharacterId: 10,
      guessLabel: 'Hero Name',
      dateKey: '2026-07-18',
    })
    expect(dup).toEqual({ status: 'skipped', reason: 'duplicate' })
  })
})
