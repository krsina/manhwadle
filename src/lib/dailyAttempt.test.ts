import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDailyPlayState,
  isMissingRpcError,
  parseDailyAttemptPublic,
  startDailyAttempt,
  submitDailyGuess,
} from './dailyAttempt'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

describe('dailyAttempt RPC helpers', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('detects missing RPC / schema-cache errors', () => {
    expect(
      isMissingRpcError(
        'Could not find the function public.start_daily_attempt in the schema cache',
      ),
    ).toBe(true)
    expect(isMissingRpcError('rate_limited')).toBe(false)
  })

  it('parses guest answer_id from play state', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        date_key: '2026-07-29',
        mode: 'summary',
        taste: 'action',
        meta: { clue: { type: 'summary', blurbs: ['a'] }, fingerprint: {} },
        max_guesses: 6,
        answer_id: 182139,
        character_id: null,
        attempt: null,
      },
      error: null,
    })
    const result = await fetchDailyPlayState('summary', 'action')
    expect(result).toMatchObject({
      ok: true,
      answerId: 182139,
      characterId: null,
      attempt: null,
    })
  })

  it('parses attempt public state and omits non-terminal answer ids', () => {
    const active = parseDailyAttemptPublic({
      date_key: '2026-07-18',
      mode: 'summary',
      taste: 'both',
      hard_mode: true,
      hints_used: 1,
      guess_ids: [3],
      guess_count: 1,
      max_guesses: 6,
      status: 'active',
      character_id: 9,
      meta: { a: 1 },
      answer_id: null,
      finalized_at: null,
    })
    expect(active?.answerId).toBeNull()
    expect(active?.characterId).toBeNull()
    expect(active?.hardMode).toBe(true)
    expect(active?.guessIds).toEqual([3])

    const won = parseDailyAttemptPublic({
      date_key: '2026-07-18',
      mode: 'summary',
      taste: 'both',
      hard_mode: true,
      hints_used: 1,
      guess_ids: [3],
      guess_count: 1,
      max_guesses: 6,
      status: 'won',
      character_id: 9,
      meta: { a: 1 },
      answer_id: 3,
      finalized_at: '2026-07-18T00:00:00Z',
    })
    expect(won?.answerId).toBe(3)
  })

  it('marks start failures as migrationMissing when RPC is absent', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'Could not find the function public.start_daily_attempt in the schema cache',
      },
    })
    const result = await startDailyAttempt({
      mode: 'summary',
      taste: 'both',
    })
    expect(result).toEqual({
      ok: false,
      error:
        'Could not find the function public.start_daily_attempt in the schema cache',
      migrationMissing: true,
    })
  })

  it('parses accepted guess + auto-finalized completion', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        accepted: true,
        correct: false,
        guess_id: 4,
        guess_count: 6,
        finalized: true,
        attempt: {
          date_key: '2026-07-18',
          mode: 'cover',
          taste: 'action',
          hard_mode: false,
          hints_used: 0,
          guess_ids: [1, 2, 3, 4, 5, 6],
          guess_count: 6,
          max_guesses: 6,
          status: 'lost',
          character_id: null,
          meta: null,
          answer_id: 99,
          finalized_at: '2026-07-18T03:00:00Z',
        },
        completion: {
          ok: true,
          inserted: true,
          date_key: '2026-07-18',
          mode: 'cover',
          taste: 'action',
          outcome: 'lost',
          guess_count: 6,
          hints_used: 0,
          hard_mode: false,
          surrendered: false,
          answer_id: 99,
          character_id: null,
          completed_at: '2026-07-18T03:00:00Z',
          point_delta: 0,
          play_point_delta: 0,
          points_balance: 12,
        },
      },
      error: null,
    })

    const result = await submitDailyGuess({
      mode: 'cover',
      taste: 'action',
      guessId: 4,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.finalized).toBe(true)
      expect(result.attempt?.answerId).toBe(99)
      expect(result.completion?.outcome).toBe('lost')
    }
  })
})
