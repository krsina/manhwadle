#!/usr/bin/env node
/**
 * Authenticated three-player Group Versus smoke test.
 * Uses a local/staging Supabase project and temporary users; never changes schema.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    values[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

async function envFile() {
  const values = {}
  for (const name of ['.env', '.env.local']) {
    try {
      Object.assign(values, parseEnv(await readFile(join(ROOT, name), 'utf8')))
    } catch {
      // Optional environment file.
    }
  }
  return values
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  if (!data?.ok) throw new Error(`${name}: ${data?.error || JSON.stringify(data)}`)
  return data
}

async function main() {
  const file = await envFile()
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    file.VITE_SUPABASE_URL ||
    file.SUPABASE_URL
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    file.VITE_SUPABASE_ANON_KEY ||
    file.VITE_SUPABASE_PUBLISHABLE_KEY
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || file.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Missing Supabase URL, publishable/anon key, or service role key.')
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const suffix = Date.now().toString(36)
  const password = `Versus-${crypto.randomUUID()}!`
  const users = []
  const clients = []

  try {
    for (let index = 0; index < 3; index += 1) {
      const email = `versus-smoke-${suffix}-${index}@example.com`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(error?.message || 'Temporary user creation failed')
      users.push(data.user.id)

      const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const signed = await client.auth.signInWithPassword({ email, password })
      if (signed.error || !signed.data.session) {
        throw new Error(signed.error?.message || 'Temporary user sign-in failed')
      }
      await rpc(client, 'claim_username', { p_username: `vs${suffix.slice(-7)}${index}` })
      await rpc(client, 'update_my_settings', { p_reader_taste: 'both' })
      clients.push(client)
    }

    const { data: poolRows, error: poolError } = await admin
      .from('puzzle_pool_entries')
      .select('manhwa_id')
      .eq('mode', 'summary')
      .limit(600)
    if (poolError) throw new Error(`Pool lookup: ${poolError.message}`)
    const candidateIds = [...new Set((poolRows ?? []).map((row) => row.manhwa_id))]
    assert(
      candidateIds.length >= 120,
      'Need 120 summary catalog titles to prove lists exceed the old cap',
    )
    // The host list intentionally passes the retired 100-title ceiling.
    const hostListSize = 120
    const savedListIds = []
    for (let index = 0; index < clients.length; index += 1) {
      const offset = index * 2
      const listIds = index === 0
        ? candidateIds.slice(0, hostListSize)
        : candidateIds.slice(offset, offset + 8)
      const saved = await rpc(clients[index], 'saved_list_create', {
        p_name: `Smoke picks ${index + 1}`,
        p_manhwa_ids: listIds,
        p_idempotency_key: `smoke-list-${suffix}-${index}`,
      })
      savedListIds.push(saved.list.id)
    }

    const created = await rpc(clients[0], 'multiplayer_create_room', {
      p_selected_modes: ['summary'],
      p_max_players: 3,
      p_pool_source: 'collaborative_lists',
      p_idempotency_key: `smoke-create-${suffix}`,
    })
    const room = created.state.room
    assert(room?.id && room?.code, 'Create response did not include a room ID/code')

    for (let index = 1; index < clients.length; index += 1) {
      await rpc(clients[index], 'multiplayer_join_room', {
        p_code: room.code,
        p_idempotency_key: `smoke-join-${suffix}-${index}`,
      })
    }
    const contribute = async (index) => {
      const contributed = await rpc(
        clients[index],
        'multiplayer_set_list_contribution',
        {
          p_room_id: room.id,
          p_list_id: savedListIds[index],
          p_idempotency_key: `smoke-contribute-${suffix}-${index}`,
        },
      )
      const own = contributed.state.list_contributions.find(
        (item) => item.user_id === users[index],
      )
      assert(
        own?.source_list_id === savedListIds[index],
        'Own contribution did not retain its private list ID',
      )
      assert(
        contributed.state.list_contributions
          .filter((item) => item.user_id !== users[index])
          .every((item) => item.source_list_id == null),
        'Foreign contribution leaked a reusable list ID',
      )
      return contributed
    }

    const hostShare = await contribute(0)
    assert(
      hostShare.state.pool_summary.required_contributor_count === 1,
      'Collaborative rooms should require only one shared list',
    )
    assert(
      hostShare.state.pool_summary.contributor_count === 1,
      'Host contribution was not counted',
    )
    assert(
      hostShare.state.list_contributions.find(
        (item) => item.user_id === users[0],
      )?.entry_count === hostListSize,
      'A list larger than the retired 100-title cap was truncated',
    )
    for (let index = 1; index < clients.length; index += 1) {
      const ready = await rpc(clients[index], 'multiplayer_set_ready', {
        p_room_id: room.id,
        p_ready: true,
        p_idempotency_key: `smoke-ready-optional-${suffix}-${index}`,
      })
      assert(
        ready.state.members.find((member) => member.user_id === users[index])
          ?.is_ready === true,
        'Player without a shared list could not ready up',
      )
    }
    for (let index = 1; index < clients.length; index += 1) {
      await contribute(index)
    }
    for (let index = 0; index < clients.length; index += 1) {
      await rpc(clients[index], 'multiplayer_set_ready', {
        p_room_id: room.id,
        p_ready: true,
        p_idempotency_key: `smoke-ready-${suffix}-${index}`,
      })
    }

    const started = await rpc(clients[0], 'multiplayer_start_match', {
      p_room_id: room.id,
      p_idempotency_key: `smoke-start-${suffix}`,
    })
    assert(started.state.members.length === 3, 'Start did not preserve all three players')
    assert(started.state.rounds.length === 3, 'Summary-only room did not create exactly 3 rounds')
    assert(
      started.state.rounds.every((round) => round.mode === 'summary'),
      'Unexpected mode in summary-only schedule',
    )
    assert(
      started.state.pool_summary.combined_eligible_count > 100 &&
        started.state.pool_summary.combined_eligible_count <= hostListSize,
      'Overlapping contribution entries were not deduplicated across lists',
    )

    const left = await rpc(clients[2], 'multiplayer_leave_room', {
      p_room_id: room.id,
      p_idempotency_key: `smoke-leave-${suffix}`,
    })
    const withdrawn = left.state.members.find((member) => member.user_id === users[2])
    assert(withdrawn?.is_active === false, 'Active leave did not mark player withdrawn')

    const survivor = await rpc(clients[1], 'multiplayer_get_state', { p_room_id: room.id })
    assert(
      ['countdown', 'active', 'intermission'].includes(survivor.state.room.status),
      'Remaining match did not continue after withdrawal',
    )
    console.log('[pass] authenticated collaborative three-player Group Versus smoke')
  } finally {
    for (const userId of users.reverse()) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) console.error(`[cleanup] ${userId}: ${error.message}`)
    }
  }
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
