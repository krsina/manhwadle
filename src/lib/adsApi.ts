import { getTodayKey } from './daily'
import { getRewardedPointsAmount } from './ads'
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

export async function claimRewardedAdPoints(dateKey = getTodayKey()): Promise<{
  ok: boolean
  pointsAwarded?: number
  balance?: number
  error?: string
}> {
  if (!supabase) return { ok: false, error: 'not_configured' }
  const { data, error } = await supabase.rpc('claim_rewarded_ad_points', {
    p_date_key: dateKey,
    p_points: getRewardedPointsAmount(),
  })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok === false) {
    return { ok: false, error: typeof row?.error === 'string' ? row.error : 'failed' }
  }
  return {
    ok: true,
    pointsAwarded:
      typeof row.points_awarded === 'number' ? row.points_awarded : getRewardedPointsAmount(),
    balance: typeof row.balance === 'number' ? row.balance : undefined,
  }
}
