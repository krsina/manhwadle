#!/usr/bin/env node
/**
 * Adversarial Versus smoke test. Fail-closed: local/staging only.
 */

import { createClient } from '@supabase/supabase-js'
import {
  assertSecuritySmokeAllowed,
  SECURITY_SMOKE_ACK_VALUE,
} from './lib/security-smoke-guards.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function rpcResult(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  assert(data && typeof data === 'object', `${name}: missing JSON response`)
  return data
}

async function rpcOk(client, name, args) {
  const data = await rpcResult(client, name, args)
  if (!data.ok) throw new Error(`${name}: ${data.error || JSON.stringify(data)}`)
  return data
}

async function createPlayer(admin, url, anonKey, suffix, index) {
  const email = `versus-abuse-${suffix}-${index}@example.com`
  const password = `Versus-${crypto.randomUUID()}!`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(error?.message || 'Temporary user creation failed')
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error || !signed.data.session) {
    throw new Error(signed.error?.message || 'Temporary user sign-in failed')
  }
  await rpcOk(client, 'claim_username', {
    p_username: `va${suffix.slice(-7)}${index}`,
  })
  await rpcOk(client, 'update_my_settings', { p_reader_taste: 'both' })
  return {
    id: data.user.id,
    client,
    accessToken: signed.data.session.access_token,
  }
}

function secondsUntil(timestamp) {
  return (Date.parse(timestamp) - Date.now()) / 1000
}

async function rawRpc(url, anonKey, accessToken, name, body, timezone) {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: `timezone=${timezone}`,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`${name} (${timezone}): ${JSON.stringify(data)}`)
  }
  const applied = response.headers.get('Preference-Applied') ?? ''
  assert(
    applied
      .split(',')
      .map((value) => value.trim())
      .includes(`timezone=${timezone}`),
    `${name}: PostgREST did not apply timezone=${timezone}`,
  )
  return data
}

async function main() {
  const gate = assertSecuritySmokeAllowed(process.env)
  if (!gate.ok) {
    console.error(`[blocked] ${gate.reason}`)
    console.error(
      `Required: SECURITY_SMOKE_TARGET=staging|local and SECURITY_SMOKE_ACK_NON_PRODUCTION=${SECURITY_SMOKE_ACK_VALUE}`,
    )
    process.exit(2)
  }

  const { url, serviceKey, anonKey, target } = gate
  console.log(`[info] multiplayer abuse target=${target} url=${url}`)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const suffix = Date.now().toString(36)
  const players = []

  try {
    for (let index = 0; index < 3; index += 1) {
      players.push(await createPlayer(admin, url, anonKey, suffix, index))
    }
    const [host, guest, scanner] = players

    const { data: poolRows, error: poolError } = await admin
      .from('puzzle_pool_entries')
      .select('manhwa_id')
      .eq('mode', 'summary')
      .limit(600)
    if (poolError) throw new Error(`Pool lookup: ${poolError.message}`)
    const candidateIds = [...new Set((poolRows ?? []).map((row) => row.manhwa_id))]
    assert(candidateIds.length >= 120, 'Need summary catalog titles for list abuse smoke')

    const hostList = await rpcOk(host.client, 'saved_list_create', {
      p_name: 'Host private picks',
      p_manhwa_ids: candidateIds.slice(0, 6),
      p_idempotency_key: `abuse-host-list-${suffix}`,
    })
    const guestList = await rpcOk(guest.client, 'saved_list_create', {
      p_name: 'Guest private picks',
      p_manhwa_ids: candidateIds.slice(2, 8),
      p_idempotency_key: `abuse-guest-list-${suffix}`,
    })
    const crossRead = await rpcResult(guest.client, 'saved_list_get', {
      p_list_id: hostList.list.id,
    })
    assert(
      crossRead.ok === false && crossRead.error === 'list_not_found',
      `cross-user list read was not hidden: ${JSON.stringify(crossRead)}`,
    )
    const directPrivateRead = await guest.client
      .schema('app_private')
      .from('user_saved_lists')
      .select('id')
    assert(
      Boolean(directPrivateRead.error) && !directPrivateRead.data,
      'authenticated caller directly read private saved-list table',
    )

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const invalid = await rpcResult(scanner.client, 'saved_list_create', {
        p_name: `Invalid ${attempt}`,
        p_manhwa_ids: [candidateIds[0], candidateIds[1]],
        p_idempotency_key: `abuse-invalid-list-${suffix}-${attempt}`,
      })
      const expected = attempt < 10 ? 'invalid_list_entries' : 'rate_limited'
      assert(
        invalid.ok === false && invalid.error === expected,
        `failed list request ${attempt + 1} did not consume rate budget: ${JSON.stringify(invalid)}`,
      )
    }
    // Catalog membership is the only ceiling now, so a 120-title list is legal.
    const large = await rpcResult(guest.client, 'saved_list_set_entries', {
      p_list_id: guestList.list.id,
      p_manhwa_ids: candidateIds.slice(0, 120),
      p_idempotency_key: `abuse-large-list-${suffix}`,
    })
    assert(
      large.ok === true && large.list?.manhwa_ids?.length === 120,
      `list beyond the retired 100 cap was rejected: ${JSON.stringify(large)}`,
    )
    const duplicated = await rpcResult(guest.client, 'saved_list_set_entries', {
      p_list_id: guestList.list.id,
      p_manhwa_ids: [candidateIds[0], candidateIds[1], candidateIds[0]],
      p_idempotency_key: `abuse-duplicate-list-${suffix}`,
    })
    assert(
      duplicated.ok === false && duplicated.error === 'duplicate_list_title',
      `duplicate titles accepted: ${JSON.stringify(duplicated)}`,
    )
    const tooSmall = await rpcResult(guest.client, 'saved_list_set_entries', {
      p_list_id: guestList.list.id,
      p_manhwa_ids: candidateIds.slice(0, 2),
      p_idempotency_key: `abuse-small-list-${suffix}`,
    })
    assert(
      tooSmall.ok === false && tooSmall.error === 'invalid_list_entries',
      `list below the three-title minimum accepted: ${JSON.stringify(tooSmall)}`,
    )
    const invalidCatalog = await rpcResult(guest.client, 'saved_list_set_entries', {
      p_list_id: guestList.list.id,
      p_manhwa_ids: [2_000_000_001, 2_000_000_002, 2_000_000_003],
      p_idempotency_key: `abuse-foreign-catalog-${suffix}`,
    })
    assert(
      invalidCatalog.ok === false &&
        invalidCatalog.error === 'list_title_not_in_catalog',
      `non-catalog ids accepted: ${JSON.stringify(invalidCatalog)}`,
    )

    const privateRoom = await rpcOk(host.client, 'multiplayer_create_room', {
      p_selected_modes: ['summary'],
      p_max_players: 2,
      p_pool_source: 'collaborative_lists',
      p_idempotency_key: `abuse-private-room-${suffix}`,
    })
    await rpcOk(guest.client, 'multiplayer_join_room', {
      p_code: privateRoom.state.room.code,
      p_idempotency_key: `abuse-private-join-${suffix}`,
    })
    const crossContribution = await rpcResult(
      guest.client,
      'multiplayer_set_list_contribution',
      {
        p_room_id: privateRoom.state.room.id,
        p_list_id: hostList.list.id,
        p_idempotency_key: `abuse-cross-contribution-${suffix}`,
      },
    )
    assert(
      crossContribution.ok === false &&
        crossContribution.error === 'list_not_found',
      `cross-user list contribution accepted: ${JSON.stringify(crossContribution)}`,
    )
    await rpcOk(host.client, 'multiplayer_set_list_contribution', {
      p_room_id: privateRoom.state.room.id,
      p_list_id: hostList.list.id,
      p_idempotency_key: `abuse-host-contribution-${suffix}`,
    })
    const guestContribution = await rpcOk(
      guest.client,
      'multiplayer_set_list_contribution',
      {
        p_room_id: privateRoom.state.room.id,
        p_list_id: guestList.list.id,
        p_idempotency_key: `abuse-guest-contribution-${suffix}`,
      },
    )
    assert(
      !JSON.stringify(guestContribution.state).includes('manhwa_ids'),
      'room state leaked contribution title ids',
    )
    const foreignMetadata = guestContribution.state.list_contributions.find(
      (item) => item.user_id === host.id,
    )
    assert(
      foreignMetadata && foreignMetadata.source_list_id == null,
      'room state leaked another member list ID',
    )
    await rpcOk(host.client, 'multiplayer_leave_room', {
      p_room_id: privateRoom.state.room.id,
      p_idempotency_key: `abuse-private-leave-${suffix}`,
    })

    const timezoneRoom = await rawRpc(
      url,
      anonKey,
      scanner.accessToken,
      'multiplayer_create_room',
      {
        p_selected_modes: ['summary'],
        p_max_players: 2,
        p_pool_source: 'both',
        p_idempotency_key: `abuse-timezone-${suffix}`,
      },
      'Pacific/Kiritimati',
    )
    assert(timezoneRoom.ok, `timezone create failed: ${JSON.stringify(timezoneRoom)}`)
    const timezoneTtl = secondsUntil(timezoneRoom.state.room.expires_at)
    assert(
      timezoneTtl > 6_900 && timezoneTtl <= 7_300,
      `request timezone distorted room TTL: ${timezoneTtl}s`,
    )
    await rpcOk(scanner.client, 'multiplayer_leave_room', {
      p_room_id: timezoneRoom.state.room.id,
      p_idempotency_key: `abuse-timezone-leave-${suffix}`,
    })

    for (let match = 0; match < 3; match += 1) {
      const created = await rpcOk(host.client, 'multiplayer_create_room', {
        p_selected_modes: ['summary'],
        p_max_players: 2,
        p_pool_source: 'both',
        p_idempotency_key: `abuse-create-${suffix}-${match}`,
      })
      const room = created.state.room
      assert(/^[A-Z2-9]{8}$/.test(room.code), `weak room code: ${room.code}`)
      const lobbyTtl = secondsUntil(room.expires_at)
      assert(
        lobbyTtl > 6_900 && lobbyTtl <= 7_300,
        `unexpected lobby TTL: ${lobbyTtl}s`,
      )

      await rpcOk(guest.client, 'multiplayer_join_room', {
        p_code: room.code,
        p_idempotency_key: `abuse-join-${suffix}-${match}`,
      })
      for (const [index, player] of [host, guest].entries()) {
        await rpcOk(player.client, 'multiplayer_set_ready', {
          p_room_id: room.id,
          p_ready: true,
          p_idempotency_key: `abuse-ready-${suffix}-${match}-${index}`,
        })
      }
      await rpcOk(host.client, 'multiplayer_start_match', {
        p_room_id: room.id,
        p_idempotency_key: `abuse-start-${suffix}-${match}`,
      })
      await rpcOk(guest.client, 'multiplayer_leave_room', {
        p_room_id: room.id,
        p_idempotency_key: `abuse-guest-leave-${suffix}-${match}`,
      })

      const inactive = await rpcResult(guest.client, 'multiplayer_get_state', {
        p_room_id: room.id,
      })
      assert(
        inactive.ok === false && inactive.error === 'member_inactive',
        `inactive member still read live room: ${JSON.stringify(inactive)}`,
      )

      const cancelled = await rpcOk(host.client, 'multiplayer_leave_room', {
        p_room_id: room.id,
        p_idempotency_key: `abuse-host-leave-${suffix}-${match}`,
      })
      const cancelledTtl = secondsUntil(cancelled.state.room.expires_at)
      assert(
        cancelled.state.room.status === 'cancelled' &&
          cancelledTtl > 240 &&
          cancelledTtl <= 310,
        `unexpected cancelled retention: ${JSON.stringify(cancelled.state.room)}`,
      )
    }

    const cooledDown = await rpcResult(host.client, 'multiplayer_create_room', {
      p_selected_modes: ['summary'],
      p_max_players: 2,
      p_pool_source: 'both',
      p_idempotency_key: `abuse-cooldown-${suffix}`,
    })
    assert(
      cooledDown.ok === false && cooledDown.error === 'abuse_cooldown',
      `early-abandon cooldown missing: ${JSON.stringify(cooledDown)}`,
    )

    for (let attempt = 0; attempt < 13; attempt += 1) {
      const result = await rpcResult(scanner.client, 'multiplayer_join_room', {
        p_code: 'ZZZZZZZZ',
        p_idempotency_key: `abuse-scan-${suffix}-${attempt}`,
      })
      const expected = attempt < 12 ? 'room_not_joinable' : 'rate_limited'
      assert(
        result.ok === false && result.error === expected,
        `join attempt ${attempt + 1}: expected ${expected}, got ${JSON.stringify(result)}`,
      )
    }

    console.log('[pass] multiplayer abuse limits, access, codes, and retention')
  } finally {
    for (const player of players.reverse()) {
      const { error } = await admin.auth.admin.deleteUser(player.id)
      if (error) console.error(`[cleanup] ${player.id}: ${error.message}`)
    }
  }
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
