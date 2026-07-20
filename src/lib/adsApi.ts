import { getTodayKey } from './daily'
import { supabase } from './supabase'

export async function fetchRewardedAdClaimStatus(dateKey = getTodayKey()): Promise<{
  ok: boolean
  claimed?: boolean
  error?: string
}> {
  if (!supabase) return { ok: false, error: 'not_configured' }
  const { data, error } = await supabase.rpc('get_rewarded_ad_claim_status', {
    p_date_key: dateKey,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok === false) {
    return { ok: false, error: typeof row?.error === 'string' ? row.error : 'failed' }
  }
  return {
    ok: true,
    claimed: row.claimed === true,
  }
}

/**
 * Rewarded-ad DB claims are disabled until provider verification exists.
 * Never send a client-chosen point amount as authoritative.
 */
export async function claimRewardedAdPoints(dateKey = getTodayKey()): Promise<{
  ok: boolean
  pointsAwarded?: number
  balance?: number
  error?: string
  providerVerificationRequired?: boolean
}> {
  if (!supabase) return { ok: false, error: 'not_configured' }
  // p_points retained for signature compatibility only; server ignores / never awards.
  const { data, error } = await supabase.rpc('claim_rewarded_ad_points', {
    p_date_key: dateKey,
    p_points: null,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok === false) {
    const err = typeof row?.error === 'string' ? row.error : 'failed'
    return {
      ok: false,
      error: err,
      providerVerificationRequired: err === 'provider_verification_required',
      balance: typeof row?.points_balance === 'number' ? row.points_balance : undefined,
    }
  }
  return {
    ok: true,
    pointsAwarded: typeof row.points_awarded === 'number' ? row.points_awarded : 0,
    balance: typeof row.balance === 'number' ? row.balance : undefined,
  }
}
