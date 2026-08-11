#!/usr/bin/env node
/**
 * Staging-only News comments lifecycle smoke.
 *
 * Requires a pre-provisioned staging owner account plus the guarded staging
 * credentials used by the other security smokes. Never targets production.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  assertSecuritySmokeAllowed,
  SECURITY_SMOKE_ACK_VALUE,
} from './lib/security-smoke-guards.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
  }
  return values
}

async function envFiles() {
  const values = {}
  for (const name of ['.env', '.env.local']) {
    try {
      Object.assign(values, parseEnv(await readFile(join(ROOT, name), 'utf8')))
    } catch {
      // Optional local environment file.
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
  return data
}

async function invokeModeration(url, anonKey, accessToken, body) {
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/moderation`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      `moderation ${body.action}: ${response.status} ${payload?.error || text || 'empty response'}`,
    )
  }
  return payload.result
}

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Sign in ${email}: ${error?.message || 'no session'}`)
  }
  return { client, session: data.session }
}

async function main() {
  const merged = { ...(await envFiles()), ...process.env }
  const gate = assertSecuritySmokeAllowed(merged)
  if (!gate.ok) {
    throw new Error(
      `${gate.reason} Required SECURITY_SMOKE_TARGET=staging and ` +
        `SECURITY_SMOKE_ACK_NON_PRODUCTION=${SECURITY_SMOKE_ACK_VALUE}.`,
    )
  }

  const ownerEmail = String(merged.STAGING_NEWS_OWNER_EMAIL || '').trim()
  const ownerPassword = String(merged.STAGING_NEWS_OWNER_PASSWORD || '').trim()
  if (!ownerEmail || !ownerPassword) {
    throw new Error('Missing STAGING_NEWS_OWNER_EMAIL or STAGING_NEWS_OWNER_PASSWORD.')
  }

  const { url, anonKey, serviceKey } = gate
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const suffix = Date.now().toString(36)
  const userEmail = `news-smoke-${suffix}@example.com`
  const userPassword = `News-${crypto.randomUUID()}!`
  const slug = `staging-news-smoke-${suffix}`
  let userId
  let postId

  try {
    const created = await admin.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
    })
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message || 'Temporary user creation failed')
    }
    userId = created.data.user.id

    const owner = await signIn(url, anonKey, ownerEmail, ownerPassword)
    const user = await signIn(url, anonKey, userEmail, userPassword)
    const claimed = await rpc(user.client, 'claim_username', {
      p_username: `news${suffix.slice(-8)}`,
    })
    assert(claimed?.ok === true, `claim_username: ${JSON.stringify(claimed)}`)

    const upserted = await invokeModeration(url, anonKey, owner.session.access_token, {
      action: 'upsert_site_update',
      title: `Staging News smoke ${suffix}`,
      body: 'Temporary staging-only lifecycle validation post.',
      slug,
      published: true,
      kind: 'announcement',
    })
    postId = upserted?.update?.id
    assert(postId, 'News upsert did not return a post ID')

    const visible = await rpc(user.client, 'post_site_update_comment', {
      p_slug: slug,
      p_body: `Visible staging comment ${suffix}`,
    })
    assert(visible?.ok === true && visible.outcome === 'visible', 'Visible comment failed')
    const visibleId = visible.comment?.id
    assert(visibleId, 'Visible comment did not return an ID')

    const quarantined = await rpc(user.client, 'post_site_update_comment', {
      p_slug: slug,
      p_body: `Review this staging link https://example.com/${suffix}`,
    })
    assert(
      quarantined?.ok === true && quarantined.outcome === 'pending',
      'Single-link comment was not quarantined',
    )

    const publicBefore = await rpc(user.client, 'get_site_update_comments', {
      p_slug: slug,
      p_limit: 25,
      p_offset: 0,
    })
    assert(publicBefore?.total === 1, 'Pending comment leaked into the public list')

    const pending = await invokeModeration(url, anonKey, owner.session.access_token, {
      action: 'list_site_update_comments',
      status: 'pending',
      post_slug: slug,
      limit: 25,
      offset: 0,
    })
    const pendingComment = pending?.comments?.[0]
    assert(pendingComment?.id, 'Pending comment was not visible to moderation')

    await invokeModeration(url, anonKey, owner.session.access_token, {
      action: 'set_site_update_comment_status',
      comment_id: pendingComment.id,
      status: 'visible',
      reason: 'staging smoke approval',
    })

    const publicAfter = await rpc(user.client, 'get_site_update_comments', {
      p_slug: slug,
      p_limit: 25,
      p_offset: 0,
    })
    assert(publicAfter?.total === 2, 'Approved comment did not become public')

    await invokeModeration(url, anonKey, owner.session.access_token, {
      action: 'issue_comment_ban',
      target_user_id: userId,
      reason: 'staging smoke temporary ban',
      ends_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      permanent: false,
    })
    const banned = await rpc(user.client, 'post_site_update_comment', {
      p_slug: slug,
      p_body: `Banned staging comment ${suffix}`,
    })
    assert(banned?.ok === false && banned.error === 'comment_banned', 'Comment ban failed')

    await invokeModeration(url, anonKey, owner.session.access_token, {
      action: 'revoke_comment_ban',
      target_user_id: userId,
      reason: 'staging smoke cleanup',
    })
    const deleted = await rpc(user.client, 'delete_my_site_update_comment', {
      p_comment_id: visibleId,
    })
    assert(deleted?.ok === true, 'Author self-delete failed')

    console.log('[pass] staging News comments lifecycle smoke')
  } finally {
    if (postId) {
      try {
        const owner = await signIn(url, anonKey, ownerEmail, ownerPassword)
        await invokeModeration(url, anonKey, owner.session.access_token, {
          action: 'delete_site_update',
          id: postId,
        })
      } catch (error) {
        console.error(`[cleanup] post: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) console.error(`[cleanup] user: ${error.message}`)
    }
  }
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
