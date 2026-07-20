import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

describe('adsApi rewarded claim', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('does not send a client-chosen point amount as authoritative', async () => {
    const { claimRewardedAdPoints } = await import('./adsApi')
    rpc.mockResolvedValue({
      data: {
        ok: false,
        error: 'provider_verification_required',
        claimed: false,
        points_balance: 40,
      },
      error: null,
    })

    const result = await claimRewardedAdPoints('2026-07-18')
    expect(rpc).toHaveBeenCalledWith('claim_rewarded_ad_points', {
      p_date_key: '2026-07-18',
      p_points: null,
    })
    expect(result).toEqual({
      ok: false,
      error: 'provider_verification_required',
      providerVerificationRequired: true,
      balance: 40,
    })
  })
})
