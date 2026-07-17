#!/usr/bin/env node
/**
 * Smoke: auth user + RLS upsert/read for player sync tables.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ anon) in .env
 *
 * Usage: node scripts/smoke-auth-sync.mjs
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

  // Profile should exist via handle_new_user trigger
  const { data: profileRow, error: profileReadErr } = await admin
    .from('profiles')
    .select('user_id, reader_taste')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileReadErr) fail(`profile trigger read: ${profileReadErr.message}`)
  else if (!profileRow) fail('profile row missing after signup trigger')
  else console.log('[ok] handle_new_user created profiles row')

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: signed, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signErr || !signed.session) {
    fail(`signInWithPassword: ${signErr?.message || 'no session'}`)
    await admin.auth.admin.deleteUser(userId)
    return
  }
  console.log('[ok] signed in as smoke user')

  const { error: tasteErr } = await userClient.from('profiles').upsert(
    { user_id: userId, reader_taste: 'action' },
    { onConflict: 'user_id' },
  )
  if (tasteErr) fail(`profiles upsert: ${tasteErr.message}`)
  else console.log('[ok] profiles upsert (reader_taste)')

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
    // RLS deny can surface as error or empty — empty is fine
    console.log('[ok] anon read blocked/errored as expected:', leakErr.message)
  } else if (leaked && leaked.length > 0) {
    fail('anon could read player_stats rows (RLS broken)')
  } else {
    console.log('[ok] anon cannot read other users player_stats')
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
