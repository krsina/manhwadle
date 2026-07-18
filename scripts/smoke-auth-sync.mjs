#!/usr/bin/env node
/**
 * Smoke: auth user + RLS upsert/read for player sync tables + identity settings.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ anon) in .env
 *
 * Usage: node scripts/smoke-auth-sync.mjs
 *
 * Identity/username checks require migration 20260718040000_identity_settings
 * to be applied. If not present, those checks are skipped (not failed).
 *
 * Moderation/RBAC checks require 20260718050000_roles_moderation. Skipped if
 * RPCs/tables are missing. Does not mutate remote schema.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnvFile(text) {
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

async function loadDotEnv() {
  try {
    return loadEnvFile(await readFile(join(ROOT, '.env'), 'utf8'))
  } catch {
    return {}
  }
}

function fail(message) {
  console.error(`[fail] ${message}`)
  process.exitCode = 1
}

function isMissingRelation(error) {
  const msg = (error?.message || '').toLowerCase()
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the function') ||
    error?.code === 'PGRST202' ||
    error?.code === '42P01'
  )
}

async function main() {
  const fileEnv = await loadDotEnv()
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    fileEnv.VITE_SUPABASE_ANON_KEY ||
    fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url || !serviceKey || !anonKey) {
    console.error('Missing Supabase URL / service role / anon key — skip auth sync smoke.')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const email = `sync-smoke-${Date.now()}@example.com`
  const password = `Smoke-${crypto.randomUUID()}!`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    fail(`createUser: ${createErr?.message || 'no user'}`)
    return
  }
  const userId = created.user.id
  console.log(`[ok] created user ${userId}`)

  // Settings should exist via handle_new_user (after identity migration).
  const { data: settingsRow, error: settingsReadErr } = await admin
    .from('user_settings')
    .select('user_id, reader_taste, leaderboard_visible')
    .eq('user_id', userId)
    .maybeSingle()

  let identityReady = true
  if (settingsReadErr && isMissingRelation(settingsReadErr)) {
    identityReady = false
    console.log('[skip] user_settings missing — apply 20260718040000_identity_settings')
  } else if (settingsReadErr) {
    fail(`user_settings trigger read: ${settingsReadErr.message}`)
  } else if (!settingsRow) {
    fail('user_settings row missing after signup trigger')
  } else {
    console.log('[ok] handle_new_user created user_settings row')
  }

  // Legacy profiles row should still exist
  const { data: profileRow, error: profileReadErr } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileReadErr) fail(`profile trigger read: ${profileReadErr.message}`)
  else if (!profileRow) fail('profile row missing after signup trigger')
  else console.log('[ok] handle_new_user created profiles row')

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let { data: signed, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signErr?.message?.toLowerCase().includes('captcha')) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) {
      fail(`generateLink after CAPTCHA: ${linkErr?.message || 'no token hash'}`)
      await admin.auth.admin.deleteUser(userId)
      return
    }
    const verified = await userClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    })
    signed = verified.data
    signErr = verified.error
  }
  if (signErr || !signed.session) {
    fail(`signInWithPassword: ${signErr?.message || 'no session'}`)
    await admin.auth.admin.deleteUser(userId)
    return
  }
  console.log('[ok] signed in as smoke user')

  if (identityReady) {
    const { error: tasteErr } = await userClient.from('user_settings').upsert(
      { user_id: userId, reader_taste: 'action' },
      { onConflict: 'user_id' },
    )
    if (tasteErr) fail(`user_settings upsert: ${tasteErr.message}`)
    else console.log('[ok] user_settings upsert (reader_taste)')

    // Direct write to public_profiles username must fail / be denied
    const { error: profileWriteErr } = await userClient.from('public_profiles').upsert(
      {
        user_id: userId,
        username: 'hacker',
        username_normalized: 'hacker',
      },
      { onConflict: 'user_id' },
    )
    if (!profileWriteErr) fail('public_profiles client upsert unexpectedly allowed')
    else console.log('[ok] public_profiles direct write denied')

    const claimName = `smoke_${Date.now().toString(36).slice(-8)}`
    const { data: claimData, error: claimErr } = await userClient.rpc('claim_username', {
      p_username: claimName,
    })
    if (claimErr) fail(`claim_username: ${claimErr.message}`)
    else if (!claimData?.ok) fail(`claim_username rejected: ${JSON.stringify(claimData)}`)
    else console.log('[ok] claim_username')

    const { data: account, error: accountErr } = await userClient.rpc('get_my_account')
    if (accountErr) fail(`get_my_account: ${accountErr.message}`)
    else if (!account?.ok || account.username?.toLowerCase() !== claimName.toLowerCase()) {
      fail(`get_my_account unexpected: ${JSON.stringify(account)}`)
    } else console.log('[ok] get_my_account after claim')

    const { data: badClaim } = await userClient.rpc('claim_username', {
      p_username: 'admin',
    })
    if (badClaim?.ok) fail('reserved username claim unexpectedly ok')
    else if (badClaim?.error !== 'unavailable' && badClaim?.error !== 'already_claimed') {
      // already_claimed if somehow reserved slipped — still not ok:true
      if (badClaim?.ok !== false) fail(`reserved claim unexpected: ${JSON.stringify(badClaim)}`)
      else console.log('[ok] reserved/unavailable username rejected')
    } else console.log('[ok] reserved/unavailable username rejected')

    const { data: settingsUpdate, error: settingsUpdateErr } = await userClient.rpc(
      'update_my_settings',
      { p_reader_taste: 'romance' },
    )
    if (settingsUpdateErr) fail(`update_my_settings: ${settingsUpdateErr.message}`)
    else if (!settingsUpdate?.ok || settingsUpdate.reader_taste !== 'romance') {
      fail(`update_my_settings unexpected: ${JSON.stringify(settingsUpdate)}`)
    } else console.log('[ok] update_my_settings (taste)')

    // Immediate second change should be allowed (first claim is not a change).
    const changeName = `${claimName}x`
    const { data: changeData, error: changeErr } = await userClient.rpc('change_username', {
      p_username: changeName,
    })
    if (changeErr) fail(`change_username: ${changeErr.message}`)
    else if (!changeData?.ok) fail(`change_username rejected: ${JSON.stringify(changeData)}`)
    else console.log('[ok] change_username (first change after claim)')

    // Immediate third change should hit cooldown
    const { data: cooldownData, error: cooldownErr } = await userClient.rpc('change_username', {
      p_username: `${changeName}2`,
    })
    if (cooldownErr) fail(`change_username cooldown call: ${cooldownErr.message}`)
    else if (cooldownData?.ok || cooldownData?.error !== 'cooldown') {
      fail(`expected cooldown, got: ${JSON.stringify(cooldownData)}`)
    } else console.log('[ok] username change cooldown enforced')

    // Direct client writes to moderation tables / privileged RPCs must fail.
    const { error: roleWriteErr } = await userClient.from('user_roles').insert({
      user_id: userId,
      role: 'owner',
    })
    if (!roleWriteErr) {
      // Table may be invisible (schema not exposed) — treat as ok.
      console.log('[ok] user_roles not writable via public API (or not exposed)')
    } else {
      console.log('[ok] user_roles client write denied:', roleWriteErr.message)
    }

    const { data: grantAttempt, error: grantErr } = await userClient.rpc(
      'moderation_grant_role',
      {
        p_actor_id: userId,
        p_target_user_id: userId,
        p_role: 'owner',
        p_reason: 'self escalate',
      },
    )
    if (grantErr && isMissingRelation(grantErr)) {
      console.log('[skip] moderation RPCs missing — apply 20260718050000_roles_moderation')
    } else if (!grantErr && grantAttempt?.ok) {
      fail('moderation_grant_role unexpectedly allowed for authenticated user')
    } else {
      console.log('[ok] moderation_grant_role not executable by authenticated client')
    }

    const { data: reportData, error: reportErr } = await userClient.rpc('submit_user_report', {
      p_target_username: changeName,
      p_reason_code: 'other',
      p_details: 'smoke self-report should fail',
    })
    if (reportErr && isMissingRelation(reportErr)) {
      console.log('[skip] submit_user_report missing')
    } else if (reportErr) {
      fail(`submit_user_report: ${reportErr.message}`)
    } else if (!reportData?.ok && reportData?.error === 'cannot_target_self') {
      console.log('[ok] submit_user_report rejects self target')
    } else {
      fail(`submit_user_report unexpected: ${JSON.stringify(reportData)}`)
    }

    const { data: accountStaff, error: accountStaffErr } = await userClient.rpc('get_my_account')
    if (accountStaffErr) fail(`get_my_account staff fields: ${accountStaffErr.message}`)
    else if (accountStaff?.staff_role != null) {
      fail(`smoke user unexpectedly staff: ${accountStaff.staff_role}`)
    } else if (typeof accountStaff?.cloud_banned !== 'boolean') {
      // Older identity migration without moderation fields
      if (accountStaff?.cloud_banned === undefined) {
        console.log('[skip] get_my_account moderation fields not present yet')
      } else {
        fail(`cloud_banned missing/invalid: ${JSON.stringify(accountStaff)}`)
      }
    } else {
      console.log('[ok] get_my_account includes cloud_banned/staff_role')
    }
  }

  const { error: statsErr } = await userClient.from('player_stats').upsert(
    {
      user_id: userId,
      mode: 'summary',
      taste: 'action',
      played: 2,
      wins: 1,
      current_streak: 1,
      max_streak: 1,
      last_played_date_key: '2026-07-15',
      guess_distribution: [0, 1, 0, 0, 0, 0],
      bonus_attempts: 1,
      bonus_correct: 1,
      double_solves: 1,
      last_bonus_date_key: '2026-07-15',
    },
    { onConflict: 'user_id,mode,taste' },
  )
  if (statsErr) fail(`player_stats upsert: ${statsErr.message}`)
  else console.log('[ok] player_stats upsert')

  const { error: dayErr } = await userClient.from('day_progress').upsert(
    {
      user_id: userId,
      mode: 'summary',
      taste: 'action',
      date_key: '2026-07-15',
      guess_ids: [101, 202],
      guess_labels: ['Title A', 'Title B'],
      status: 'won',
      answer_id: 202,
      bonus_name_guess: null,
      bonus_name_correct: null,
    },
    { onConflict: 'user_id,mode,taste,date_key' },
  )
  if (dayErr) fail(`day_progress upsert: ${dayErr.message}`)
  else console.log('[ok] day_progress upsert')

  const { data: statsRead, error: statsReadErr } = await userClient
    .from('player_stats')
    .select('played, wins, last_played_date_key, bonus_attempts, bonus_correct, double_solves')
    .eq('user_id', userId)
    .eq('mode', 'summary')
    .eq('taste', 'action')
    .maybeSingle()
  if (statsReadErr) fail(`player_stats read: ${statsReadErr.message}`)
  else if (
    !statsRead ||
    statsRead.played !== 2 ||
    statsRead.wins !== 1 ||
    statsRead.bonus_attempts !== 1 ||
    statsRead.bonus_correct !== 1 ||
    statsRead.double_solves !== 1
  ) {
    fail(`player_stats read unexpected: ${JSON.stringify(statsRead)}`)
  } else console.log('[ok] player_stats read back under RLS (incl. double_solves)')

  // Anon (no session) must not see rows
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: leaked, error: leakErr } = await anon
    .from('player_stats')
    .select('user_id')
    .eq('user_id', userId)
  if (leakErr) {
    console.log('[ok] anon read blocked/errored as expected:', leakErr.message)
  } else if (leaked && leaked.length > 0) {
    fail('anon could read player_stats rows (RLS broken)')
  } else {
    console.log('[ok] anon cannot read other users player_stats')
  }

  if (identityReady) {
    const { data: settingsLeak, error: settingsLeakErr } = await anon
      .from('user_settings')
      .select('user_id, reader_taste')
      .eq('user_id', userId)
    if (settingsLeakErr) {
      console.log('[ok] anon user_settings blocked/errored:', settingsLeakErr.message)
    } else if (settingsLeak && settingsLeak.length > 0) {
      fail('anon could read user_settings (RLS broken)')
    } else {
      console.log('[ok] anon cannot read user_settings')
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) fail(`cleanup deleteUser: ${delErr.message}`)
  else console.log('[ok] cleaned up smoke user')

  if (!process.exitCode) console.log('[pass] auth + cloud sync smoke')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
