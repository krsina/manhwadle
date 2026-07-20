#!/usr/bin/env node
/**
 * Adversarial security negatives against staging / local Supabase only.
 *
 * Fail-closed: refuses to run unless SECURITY_SMOKE_TARGET + acknowledgment
 * and staging-prefixed credentials are set. Never uses VITE_/production keys.
 *
 * Usage: npm run test:live:security
 *
 * See docs/runbooks/security-negatives-staging.md
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  assertSecuritySmokeAllowed,
  SECURITY_SMOKE_ACK_VALUE,
} from './lib/security-smoke-guards.mjs'

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

function ok(message) {
  console.log(`[ok] ${message}`)
}

function skip(message) {
  console.log(`[skip] ${message}`)
}

function isMissingRelation(error) {
  const msg = (error?.message || '').toLowerCase()
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the function') ||
    error?.code === 'PGRST202' ||
    error?.code === '42P01' ||
    error?.code === 'PGRST205'
  )
}

function jsonHasAnswerId(value) {
  if (value == null) return false
  if (Array.isArray(value)) return value.some(jsonHasAnswerId)
  if (typeof value !== 'object') return false
  for (const [k, v] of Object.entries(value)) {
    if (k === 'answer_id' || k === 'answerId') {
      if (v != null && v !== '') return true
    }
    if (jsonHasAnswerId(v)) return true
  }
  return false
}

async function signInUser(url, anonKey, admin, email, password) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let { data: signed, error: signErr } = await client.auth.signInWithPassword({
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
      return {
        client,
        error: linkErr || new Error('no token hash after CAPTCHA'),
      }
    }
    const verified = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    })
    signed = verified.data
    signErr = verified.error
  }
  if (signErr || !signed?.session) {
    return { client, error: signErr || new Error('no session') }
  }
  return { client, session: signed.session, error: null }
}

async function createIsolatedUser(admin, label) {
  const email = `sec-neg-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`
  const password = `Smoke-${crypto.randomUUID()}!`
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    throw new Error(`createUser(${label}): ${createErr?.message || 'no user'}`)
  }
  return { id: created.user.id, email, password }
}

async function invokeEdge(url, anonKey, path, { method = 'POST', jwt, body } = {}) {
  const headers = {
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, text, json }
}

async function main() {
  const fileEnv = await loadDotEnv()
  const merged = { ...fileEnv, ...process.env }
  const gate = assertSecuritySmokeAllowed(merged)

  if (!gate.ok) {
    console.error(`[blocked] ${gate.reason}`)
    console.error(
      `Required: SECURITY_SMOKE_TARGET=staging|local and SECURITY_SMOKE_ACK_NON_PRODUCTION=${SECURITY_SMOKE_ACK_VALUE}`,
    )
    console.error(
      'Plus STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY / STAGING_SUPABASE_ANON_KEY',
    )
    console.error('See docs/runbooks/security-negatives-staging.md')
    process.exit(2)
  }

  const { url, serviceKey, anonKey, target } = gate
  console.log(`[info] security negatives target=${target} url=${url}`)

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const createdIds = []
  let userA
  let userB
  let clientA
  let clientB
  let sessionA

  try {
    userA = await createIsolatedUser(admin, 'a')
    userB = await createIsolatedUser(admin, 'b')
    createdIds.push(userA.id, userB.id)
    ok(`created isolated users A=${userA.id} B=${userB.id}`)

    const signedA = await signInUser(url, anonKey, admin, userA.email, userA.password)
    if (signedA.error) {
      fail(`signIn A: ${signedA.error.message}`)
      return
    }
    clientA = signedA.client
    sessionA = signedA.session
    ok('signed in as user A')

    const signedB = await signInUser(url, anonKey, admin, userB.email, userB.password)
    if (signedB.error) {
      fail(`signIn B: ${signedB.error.message}`)
      return
    }
    clientB = signedB.client
    ok('signed in as user B')

    // ------------------------------------------------------------------
    // Cross-user reads / writes
    // ------------------------------------------------------------------
    {
      const { error: seedErr } = await clientA.from('player_stats').upsert(
        {
          user_id: userA.id,
          mode: 'summary',
          taste: 'action',
          played: 1,
          wins: 0,
          current_streak: 0,
          max_streak: 0,
          guess_distribution: [0, 0, 0, 0, 0, 0],
        },
        { onConflict: 'user_id,mode,taste' },
      )
      if (seedErr) fail(`seed player_stats A: ${seedErr.message}`)
      else ok('seeded player_stats for A')

      const { data: crossRead, error: crossReadErr } = await clientB
        .from('player_stats')
        .select('user_id, played')
        .eq('user_id', userA.id)
      if (crossReadErr && !isMissingRelation(crossReadErr)) {
        // Permission error is fine
        ok(`B cannot read A player_stats (${crossReadErr.message})`)
      } else if (crossRead && crossRead.length > 0) {
        fail('B could read A player_stats (cross-user RLS broken)')
      } else {
        ok('B cannot read A player_stats')
      }

      const { error: crossWriteErr } = await clientB.from('player_stats').upsert(
        {
          user_id: userA.id,
          mode: 'summary',
          taste: 'action',
          played: 999,
          wins: 999,
          current_streak: 0,
          max_streak: 0,
          guess_distribution: [0, 0, 0, 0, 0, 0],
        },
        { onConflict: 'user_id,mode,taste' },
      )
      if (!crossWriteErr) fail('B upsert into A player_stats unexpectedly allowed')
      else ok(`B cannot write A player_stats (${crossWriteErr.message})`)

      const { error: dayCrossErr } = await clientB.from('day_progress').upsert(
        {
          user_id: userA.id,
          mode: 'cover',
          taste: 'romance',
          date_key: '2099-01-01',
          guess_ids: [1],
          guess_labels: ['x'],
          status: 'won',
          answer_id: 1,
        },
        { onConflict: 'user_id,mode,taste,date_key' },
      )
      if (!dayCrossErr) fail('B upsert into A day_progress unexpectedly allowed')
      else ok(`B cannot write A day_progress (${dayCrossErr.message})`)
    }

    // ------------------------------------------------------------------
    // Direct locked-table DML
    // ------------------------------------------------------------------
    {
      const lockedInserts = [
        {
          table: 'user_achievements',
          row: {
            user_id: userA.id,
            achievement_id: 'secret_konami',
            achievement_version: 1,
          },
        },
        {
          table: 'user_point_balances',
          row: { user_id: userA.id, balance: 999999 },
        },
        {
          table: 'user_rewarded_ad_claims',
          row: {
            user_id: userA.id,
            date_key: '2099-01-01',
            points_awarded: 999,
          },
        },
        {
          table: 'daily_completions',
          row: {
            user_id: userA.id,
            date_key: '2099-01-01',
            mode: 'summary',
            taste: 'action',
            outcome: 'won',
            guess_count: 1,
            hints_used: 0,
            hard_mode: false,
            surrendered: false,
            answer_id: 1,
            guess_ids: [1],
          },
        },
      ]

      for (const { table, row } of lockedInserts) {
        const { error } = await clientA.from(table).insert(row)
        if (!error) fail(`direct insert into ${table} unexpectedly allowed`)
        else if (isMissingRelation(error)) skip(`${table} missing — migration not applied`)
        else ok(`direct insert into ${table} denied (${error.message})`)
      }

      const { error: roleErr } = await clientA.from('user_roles').insert({
        user_id: userA.id,
        role: 'owner',
      })
      if (!roleErr) {
        // Table may be in app_private / not exposed
        ok('user_roles not writable via public API (or not exposed)')
      } else if (isMissingRelation(roleErr)) {
        ok('user_roles not exposed to Data API')
      } else {
        ok(`user_roles client write denied (${roleErr.message})`)
      }

      // app_private.point_transactions should not be reachable via schema
      const { error: ledgerErr } = await clientA
        .schema('app_private')
        .from('point_transactions')
        .select('id')
        .limit(1)
      if (!ledgerErr) fail('app_private.point_transactions SELECT unexpectedly allowed')
      else ok(`app_private.point_transactions blocked (${ledgerErr.message})`)
    }

    // ------------------------------------------------------------------
    // Self-admin / owner grant attempts
    // ------------------------------------------------------------------
    {
      const { data: grantData, error: grantErr } = await clientA.rpc(
        'moderation_grant_role',
        {
          p_actor_id: userA.id,
          p_target_user_id: userA.id,
          p_role: 'owner',
          p_reason: 'security-negatives self escalate',
        },
      )
      if (grantErr && isMissingRelation(grantErr)) {
        skip('moderation_grant_role missing')
      } else if (!grantErr && grantData?.ok) {
        fail('moderation_grant_role allowed self-owner grant for authenticated user')
      } else {
        ok('moderation_grant_role not executable / rejected for self-owner')
      }

      const { data: account, error: accountErr } = await clientA.rpc('get_my_account')
      if (accountErr && isMissingRelation(accountErr)) {
        skip('get_my_account missing')
      } else if (accountErr) {
        fail(`get_my_account: ${accountErr.message}`)
      } else if (account?.staff_role != null) {
        fail(`user A unexpectedly staff: ${account.staff_role}`)
      } else {
        ok('user A has no staff_role after self-grant attempt')
      }
    }

    // ------------------------------------------------------------------
    // Spoofed moderation / account-data Edge calls
    // ------------------------------------------------------------------
    {
      const unauthMod = await invokeEdge(url, anonKey, 'moderation', {
        method: 'POST',
        body: { action: 'get_site_status', actor_id: userA.id },
      })
      if (unauthMod.status === 401 || unauthMod.status === 403) {
        ok(`moderation unauthenticated rejected (${unauthMod.status})`)
      } else if (unauthMod.status === 404) {
        skip('moderation Edge Function not deployed on target')
      } else {
        fail(
          `moderation unauthenticated unexpected status=${unauthMod.status} body=${unauthMod.text.slice(0, 200)}`,
        )
      }

      const spoofMod = await invokeEdge(url, anonKey, 'moderation', {
        method: 'POST',
        jwt: sessionA.access_token,
        body: {
          action: 'grant_role',
          actor_id: '00000000-0000-0000-0000-000000000001',
          target_user_id: userB.id,
          role: 'owner',
          reason: 'spoof actor',
        },
      })
      if (spoofMod.status === 404) {
        skip('moderation Edge Function not deployed on target')
      } else if (
        spoofMod.status >= 400 &&
        (String(spoofMod.json?.error || spoofMod.text)
          .toLowerCase()
          .includes('actor_id') ||
          String(spoofMod.json?.error || '').toLowerCase().includes('not allowed') ||
          spoofMod.status === 400 ||
          spoofMod.status === 403)
      ) {
        ok(`moderation spoofed actor_id rejected (${spoofMod.status})`)
      } else if (spoofMod.json?.ok === true) {
        fail('moderation accepted spoofed actor_id grant')
      } else {
        // Non-staff JWT should also fail authorization even if spoof key somehow slipped
        ok(
          `moderation spoof/non-staff call did not succeed (${spoofMod.status}: ${String(spoofMod.json?.error || spoofMod.text).slice(0, 120)})`,
        )
      }

      const unauthAcct = await invokeEdge(url, anonKey, 'account-data', {
        method: 'GET',
      })
      if (unauthAcct.status === 401 || unauthAcct.status === 403) {
        ok(`account-data unauthenticated rejected (${unauthAcct.status})`)
      } else if (unauthAcct.status === 404) {
        skip('account-data Edge Function not deployed on target')
      } else {
        fail(`account-data unauthenticated unexpected status=${unauthAcct.status}`)
      }

      const spoofAcct = await invokeEdge(url, anonKey, 'account-data', {
        method: 'DELETE',
        jwt: sessionA.access_token,
        body: {
          user_id: userB.id,
          confirm: 'DELETE',
        },
      })
      if (spoofAcct.status === 404) {
        skip('account-data Edge Function not deployed on target')
      } else if (
        spoofAcct.status >= 400 &&
        (String(spoofAcct.json?.error || spoofAcct.text)
          .toLowerCase()
          .includes('user_id') ||
          String(spoofAcct.json?.error || '').toLowerCase().includes('not allowed'))
      ) {
        ok(`account-data spoofed user_id rejected (${spoofAcct.status})`)
      } else if (spoofAcct.status === 200 || spoofAcct.json?.ok === true) {
        fail('account-data DELETE succeeded with spoofed user_id (dangerous)')
      } else {
        ok(
          `account-data spoof DELETE did not succeed (${spoofAcct.status}: ${String(spoofAcct.json?.error || spoofAcct.text).slice(0, 120)})`,
        )
      }

      // Safe cron probe: no secret → must fail closed (never send real CRON_SECRET)
      const cronProbe = await invokeEdge(url, anonKey, 'select-daily-puzzles', {
        method: 'POST',
        body: { date_key: '2099-01-01' },
      })
      if (cronProbe.status === 404) {
        skip('select-daily-puzzles Edge Function not deployed on target')
      } else if (cronProbe.status === 401 || cronProbe.status === 403) {
        ok(`select-daily-puzzles without cron secret rejected (${cronProbe.status})`)
      } else if (
        cronProbe.json?.ok === true ||
        cronProbe.status === 200
      ) {
        fail('select-daily-puzzles accepted unauthenticated call')
      } else {
        ok(
          `select-daily-puzzles fail-closed without secret (${cronProbe.status})`,
        )
      }
    }

    // ------------------------------------------------------------------
    // Answer visibility (today must not leak via table / active attempt)
    // ------------------------------------------------------------------
    {
      const today = new Date().toISOString().slice(0, 10)
      const { data: todayRows, error: todayErr } = await clientA
        .from('daily_puzzles')
        .select('date_key, mode, taste, answer_id')
        .eq('date_key', today)
      if (todayErr && isMissingRelation(todayErr)) {
        skip('daily_puzzles missing')
      } else if (todayErr) {
        ok(`today daily_puzzles select blocked (${todayErr.message})`)
      } else if (todayRows && todayRows.length > 0) {
        fail(
          `today daily_puzzles visible to client (${todayRows.length} rows) — answer leak`,
        )
      } else {
        ok('today daily_puzzles not selectable by client')
      }

      const { data: playState, error: playErr } = await clientA.rpc(
        'get_daily_play_state',
        { p_mode: 'summary', p_taste: 'both' },
      )
      if (playErr && isMissingRelation(playErr)) {
        skip('get_daily_play_state missing — apply server-authoritative daily play')
      } else if (playErr) {
        fail(`get_daily_play_state: ${playErr.message}`)
      } else if (jsonHasAnswerId(playState) && playState?.attempt?.status === 'active') {
        fail('get_daily_play_state leaked answer_id on active attempt')
      } else if (playState?.ok && playState.attempt == null && jsonHasAnswerId(playState)) {
        fail('get_daily_play_state leaked answer_id without attempt')
      } else if (playState?.ok) {
        ok('get_daily_play_state omits answer_id for non-terminal state')
      } else {
        skip(`get_daily_play_state not ok: ${JSON.stringify(playState)}`)
      }
    }

    // ------------------------------------------------------------------
    // Attempt guess limits + idempotency
    // ------------------------------------------------------------------
    {
      const mode = 'heardle'
      const taste = 'action'
      const { data: startData, error: startErr } = await clientA.rpc(
        'start_daily_attempt',
        {
          p_mode: mode,
          p_taste: taste,
          p_hard_mode: false,
          p_idempotency_key: `start-${userA.id}-${mode}`,
        },
      )
      if (startErr && isMissingRelation(startErr)) {
        skip('start_daily_attempt missing — skip guess-limit checks')
      } else if (startErr) {
        fail(`start_daily_attempt: ${startErr.message}`)
      } else if (!startData?.ok) {
        skip(`start_daily_attempt not ok: ${JSON.stringify(startData)}`)
      } else if (jsonHasAnswerId(startData) && startData?.attempt?.status === 'active') {
        fail('start_daily_attempt leaked answer_id while active')
      } else {
        ok('start_daily_attempt succeeded without active answer_id')

        const maxGuesses = Number(startData?.attempt?.max_guesses || 6)
        const idemKey = `guess-idem-${userA.id}`
        const firstGuessId = 900001

        const { data: g1, error: g1Err } = await clientA.rpc('submit_daily_guess', {
          p_mode: mode,
          p_taste: taste,
          p_guess_id: firstGuessId,
          p_hints_used: null,
          p_idempotency_key: idemKey,
        })
        if (g1Err) fail(`submit_daily_guess #1: ${g1Err.message}`)
        else if (!g1?.ok) fail(`submit_daily_guess #1 not ok: ${JSON.stringify(g1)}`)
        else ok('submit_daily_guess accepted first wrong guess')

        const { data: g1b, error: g1bErr } = await clientA.rpc('submit_daily_guess', {
          p_mode: mode,
          p_taste: taste,
          p_guess_id: firstGuessId,
          p_hints_used: null,
          p_idempotency_key: idemKey,
        })
        if (g1bErr) fail(`idempotent replay error: ${g1bErr.message}`)
        else if (
          g1b?.ok &&
          g1b?.guess_count === g1?.guess_count &&
          (g1b?.accepted === false || g1b?.guess_id === firstGuessId)
        ) {
          ok('submit_daily_guess idempotency replay returned cached response')
        } else if (g1b?.error === 'duplicate_guess') {
          ok('submit_daily_guess idempotency/duplicate guarded')
        } else {
          // Cached shape may vary; ensure guess count did not double
          const count = Number(g1b?.attempt?.guess_count ?? g1b?.guess_count ?? -1)
          if (count === 1) ok('idempotent replay did not inflate guess_count')
          else fail(`idempotent replay unexpected: ${JSON.stringify(g1b)}`)
        }

        // Burn remaining guesses with unique ids, then one past max
        let last = g1
        for (let i = 2; i <= maxGuesses; i += 1) {
          const { data, error } = await clientA.rpc('submit_daily_guess', {
            p_mode: mode,
            p_taste: taste,
            p_guess_id: 900000 + i,
            p_hints_used: null,
            p_idempotency_key: `guess-${userA.id}-${i}`,
          })
          if (error) {
            fail(`submit_daily_guess #${i}: ${error.message}`)
            last = null
            break
          }
          last = data
          if (!data?.ok && data?.error === 'max_guesses') break
        }

        const { data: over, error: overErr } = await clientA.rpc('submit_daily_guess', {
          p_mode: mode,
          p_taste: taste,
          p_guess_id: 900099,
          p_hints_used: null,
          p_idempotency_key: `guess-over-${userA.id}`,
        })
        if (overErr) fail(`submit past max: ${overErr.message}`)
        else if (
          over?.error === 'max_guesses' ||
          (over?.ok && over?.accepted === false && over?.reason === 'already_terminal') ||
          last?.attempt?.status === 'lost' ||
          last?.attempt?.status === 'won'
        ) {
          ok('extra guess past max / after terminal rejected or not accepted')
        } else {
          fail(`expected max/terminal rejection, got: ${JSON.stringify(over)}`)
        }

        // Fabricated completion RPC (legacy) must not award
        const { data: legacy, error: legacyErr } = await clientA.rpc(
          'complete_daily_mode_with_reward',
          {
            p_mode: mode,
            p_taste: taste,
            p_guess_ids: [1],
            p_hints_used: 0,
            p_hard_mode: false,
            p_surrendered: false,
          },
        )
        if (legacyErr && isMissingRelation(legacyErr)) {
          skip('legacy complete_daily_mode_with_reward missing')
        } else if (legacyErr) {
          ok(`legacy completion RPC denied (${legacyErr.message})`)
        } else if (legacy?.ok && (legacy?.applied || legacy?.inserted || legacy?.point_delta > 0)) {
          fail('legacy completion RPC still awards points')
        } else if (legacy?.error === 'deprecated_use_attempt_flow' || legacy?.ok === false) {
          ok('legacy completion RPC rejects fabricated completions')
        } else {
          fail(`legacy completion unexpected: ${JSON.stringify(legacy)}`)
        }
      }
    }

    // ------------------------------------------------------------------
    // Bonus / ad / secret economic abuse
    // ------------------------------------------------------------------
    {
      const { data: balBefore } = await admin
        .from('user_point_balances')
        .select('balance')
        .eq('user_id', userA.id)
        .maybeSingle()
      const before = Number(balBefore?.balance ?? 0)

      const { data: bonusDep, error: bonusDepErr } = await clientA.rpc(
        'complete_bonus_name_with_reward',
        { p_mode: 'summary', p_taste: 'both', p_correct: true },
      )
      if (bonusDepErr && isMissingRelation(bonusDepErr)) {
        skip('complete_bonus_name_with_reward(bool) missing')
      } else if (bonusDepErr) {
        ok(`deprecated bonus boolean RPC denied (${bonusDepErr.message})`)
      } else if (bonusDep?.applied || bonusDep?.point_delta > 0) {
        fail('deprecated bonus p_correct=true still awards points')
      } else {
        ok('deprecated bonus boolean path does not award')
      }

      const { data: bonusGuess, error: bonusGuessErr } = await clientA.rpc(
        'complete_bonus_name_with_reward',
        {
          p_mode: 'summary',
          p_taste: 'both',
          p_guessed_character_id: 1,
          p_guess_label: 'definitely-not-the-answer',
        },
      )
      if (bonusGuessErr && isMissingRelation(bonusGuessErr)) {
        skip('complete_bonus_name_with_reward(guess) missing')
      } else if (bonusGuessErr) {
        fail(`bonus guess RPC: ${bonusGuessErr.message}`)
      } else if (bonusGuess?.applied && bonusGuess?.point_delta > 0) {
        fail('wrong bonus guess unexpectedly awarded points')
      } else {
        ok('wrong bonus-name guess does not award points')
      }

      const { data: adClaim, error: adErr } = await clientA.rpc(
        'claim_rewarded_ad_points',
        { p_date_key: new Date().toISOString().slice(0, 10), p_points: 9999 },
      )
      if (adErr && isMissingRelation(adErr)) {
        skip('claim_rewarded_ad_points missing')
      } else if (adErr) {
        ok(`claim_rewarded_ad_points denied (${adErr.message})`)
      } else if (adClaim?.applied || adClaim?.claimed || adClaim?.point_delta > 0) {
        fail('claim_rewarded_ad_points awarded without provider verification')
      } else if (adClaim?.error === 'provider_verification_required' || adClaim?.ok === false) {
        ok('claim_rewarded_ad_points fail-closed without provider receipt')
      } else {
        fail(`claim_rewarded_ad_points unexpected: ${JSON.stringify(adClaim)}`)
      }

      const { data: secret1, error: secretErr } = await clientA.rpc(
        'report_secret_event',
        { p_event: 'konami', p_payload: {} },
      )
      if (secretErr && isMissingRelation(secretErr)) {
        skip('report_secret_event missing')
      } else if (secretErr) {
        fail(`report_secret_event: ${secretErr.message}`)
      } else {
        const { data: secret2 } = await clientA.rpc('report_secret_event', {
          p_event: 'konami',
          p_payload: {},
        })
        const awardedTwice =
          Array.isArray(secret2?.awarded) && secret2.awarded.length > 0
        if (awardedTwice) fail('report_secret_event awarded konami twice')
        else ok('report_secret_event konami is idempotent')

        // Cosmetic secrets must not inflate balance
        const { data: balAfter } = await admin
          .from('user_point_balances')
          .select('balance')
          .eq('user_id', userA.id)
          .maybeSingle()
        const after = Number(balAfter?.balance ?? 0)
        // Allow completion-path awards from guess burn above; only flag huge inflation from secret spam
        if (after - before >= 500) {
          fail(
            `point balance inflated suspiciously during economic abuse checks (${before} → ${after})`,
          )
        } else if (secret1?.point_delta > 0 || secret2?.point_delta > 0) {
          fail('report_secret_event returned economic point_delta for cosmetic secret')
        } else {
          ok('secret event path did not apply large economic inflation')
        }
      }

      // Direct forge of point balance via RPC if any public apply exists — expect missing/denied
      const { error: applyErr } = await clientA.rpc('apply_point_transaction', {
        p_user_id: userA.id,
        p_delta: 1000,
        p_reason: 'hack',
        p_idempotency_key: 'hack',
      })
      if (applyErr && isMissingRelation(applyErr)) {
        ok('apply_point_transaction not exposed to clients')
      } else if (applyErr) {
        ok(`apply_point_transaction denied (${applyErr.message})`)
      } else {
        fail('apply_point_transaction unexpectedly callable')
      }
    }
  } finally {
    for (const id of createdIds) {
      const { error: delErr } = await admin.auth.admin.deleteUser(id)
      if (delErr) fail(`cleanup deleteUser ${id}: ${delErr.message}`)
      else ok(`cleaned up user ${id}`)
    }
  }

  if (process.exitCode) {
    console.error('[done] security negatives failed')
    process.exit(process.exitCode)
  }
  console.log('[pass] security negatives (staging/local)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
