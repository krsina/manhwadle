/**
 * DEV-only seeded News posts + comments for local UI review.
 * Mutations stay in-memory for the current session (reset on reload).
 */

import type { SiteUpdate } from './siteUpdatesApi'
import type { NewsComment } from './newsCommentsApi'
import { LOCAL_OWNER_USER_ID, LOCAL_OWNER_USERNAME } from './localOwnerPreview'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import { DEFAULT_STAGE_ID } from './avatarStages'
import {
  classifyNewsCommentBody,
  normalizeNewsCommentBody,
} from './newsCommentModeration'

export const DEV_NEWS_EVENT = 'manhwadle:dev-news'

export interface DevModerationNewsComment {
  id: string
  authorId: string
  username: string
  avatarId: string
  stageId: string
  body: string
  status: 'visible' | 'pending' | 'removed'
  createdAt: string
  updatedAt: string
  removedAt: string | null
  removalReason: string | null
  removedByAuthor: boolean
  filterCategory: string | null
  filterRule: string | null
  postId: string
  postTitle: string
  postSlug: string
}

interface DevCommentRow {
  id: string
  siteUpdateId: string
  postSlug: string
  postTitle: string
  authorId: string
  username: string
  avatarId: string
  stageId: string
  body: string
  status: 'visible' | 'pending' | 'removed'
  createdAt: string
  updatedAt: string
  removedAt: string | null
  removalReason: string | null
  removedByAuthor: boolean
  filterCategory: string | null
  filterRule: string | null
}

interface DevState {
  updates: SiteUpdate[]
  comments: DevCommentRow[]
  commentBans: Set<string>
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function seedUpdates(): SiteUpdate[] {
  return [
    {
      id: '11111111-1111-4111-8111-111111111101',
      slug: 'comments-launch',
      title: 'News comments are live (preview)',
      body:
        'Signed-in readers can leave comments under News posts.\n\nOwners and moderators can remove comments and issue comment-only bans without blocking gameplay.',
      kind: 'update',
      version: '0.9.0',
      published: true,
      publishedAt: hoursAgo(6),
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(6),
    },
    {
      id: '11111111-1111-4111-8111-111111111102',
      slug: 'weekend-maintenance',
      title: 'Weekend maintenance window',
      body:
        'A short maintenance window is planned this weekend.\n\nDaily puzzles will still appear; cloud sync may briefly pause.',
      kind: 'announcement',
      version: null,
      published: true,
      publishedAt: hoursAgo(30),
      createdAt: hoursAgo(32),
      updatedAt: hoursAgo(30),
    },
    {
      id: '11111111-1111-4111-8111-111111111103',
      slug: 'shop-avatar-refresh',
      title: 'Shop avatar refresh',
      body:
        'New Style A starters landed in the shop.\n\nEquip one from Shop, then check how it looks on Leaderboard and Versus rosters.',
      kind: 'update',
      version: '0.8.4',
      published: true,
      publishedAt: hoursAgo(72),
      createdAt: hoursAgo(74),
      updatedAt: hoursAgo(72),
    },
  ]
}

function seedComments(updates: SiteUpdate[]): DevCommentRow[] {
  const primary = updates[0]!
  const second = updates[1]!
  return [
    {
      id: '22222222-2222-4222-8222-222222222201',
      siteUpdateId: primary.id,
      postSlug: primary.slug,
      postTitle: primary.title,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      username: 'PanelHopper',
      avatarId: 'avatar_shadow_hunter',
      stageId: 'stage_dusk_plaza',
      body: 'Love this — finally a place to chat under patch notes.',
      status: 'visible',
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(5),
      removedAt: null,
      removalReason: null,
      removedByAuthor: false,
      filterCategory: null,
      filterRule: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      siteUpdateId: primary.id,
      postSlug: primary.slug,
      postTitle: primary.title,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      username: 'InkNight',
      avatarId: 'avatar_plum_blossom_blade',
      stageId: 'stage_sky_meadow',
      body: 'Will comment bans also hide old messages, or only block new posts?',
      status: 'visible',
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(4),
      removedAt: null,
      removalReason: null,
      removedByAuthor: false,
      filterCategory: null,
      filterRule: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222203',
      siteUpdateId: primary.id,
      postSlug: primary.slug,
      postTitle: primary.title,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      username: 'SpamBotX',
      avatarId: DEFAULT_AVATAR_ID,
      stageId: DEFAULT_STAGE_ID,
      body: 'Buy cheap points at totally-legit-store.example — ignore this spam.',
      status: 'removed',
      createdAt: hoursAgo(3.5),
      updatedAt: hoursAgo(3),
      removedAt: hoursAgo(3),
      removalReason: 'spam',
      removedByAuthor: false,
      filterCategory: null,
      filterRule: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222204',
      siteUpdateId: primary.id,
      postSlug: primary.slug,
      postTitle: primary.title,
      authorId: LOCAL_OWNER_USER_ID,
      username: LOCAL_OWNER_USERNAME,
      avatarId: DEFAULT_AVATAR_ID,
      stageId: DEFAULT_STAGE_ID,
      body: 'Owner note: use Ban 7d on spam accounts from this thread.',
      status: 'visible',
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(2),
      removedAt: null,
      removalReason: null,
      removedByAuthor: false,
      filterCategory: null,
      filterRule: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222205',
      siteUpdateId: second.id,
      postSlug: second.slug,
      postTitle: second.title,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
      username: 'Cliffhanger',
      avatarId: 'avatar_tower_ranker',
      stageId: 'stage_dusk_plaza',
      body: 'Thanks for the heads up on the maintenance window.',
      status: 'visible',
      createdAt: hoursAgo(20),
      updatedAt: hoursAgo(20),
      removedAt: null,
      removalReason: null,
      removedByAuthor: false,
      filterCategory: null,
      filterRule: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222206',
      siteUpdateId: primary.id,
      postSlug: primary.slug,
      postTitle: primary.title,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
      username: 'LinkDropper',
      avatarId: DEFAULT_AVATAR_ID,
      stageId: DEFAULT_STAGE_ID,
      body: 'See my thoughts at https://example.com/review',
      status: 'pending',
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
      removedAt: null,
      removalReason: null,
      removedByAuthor: false,
      filterCategory: 'external_link',
      filterRule: 'single_external_link',
    },
  ]
}

let state: DevState | null = null

function ensureState(): DevState {
  if (!import.meta.env.DEV) {
    return { updates: [], comments: [], commentBans: new Set() }
  }
  if (!state) {
    const updates = seedUpdates()
    state = {
      updates,
      comments: seedComments(updates),
      commentBans: new Set(),
    }
  }
  return state
}

function notify(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DEV_NEWS_EVENT))
}

export function isNewsDevFakeActive(): boolean {
  return Boolean(import.meta.env.DEV)
}

export function resetNewsDevFakeForTests(): void {
  state = null
}

export function listDevSiteUpdates(limit = 50): SiteUpdate[] {
  return ensureState().updates.slice(0, Math.max(1, limit))
}

export function getDevSiteUpdate(slug: string): SiteUpdate | null {
  return ensureState().updates.find((row) => row.slug === slug) ?? null
}

function toPublicComment(row: DevCommentRow, viewerId: string | null): NewsComment {
  return {
    id: row.id,
    username: row.username,
    avatarId: row.avatarId,
    stageId: row.stageId,
    body: row.body,
    status: row.status === 'removed' ? 'removed' : 'visible',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isMine: viewerId != null && viewerId === row.authorId,
  }
}

function toModerationComment(row: DevCommentRow): DevModerationNewsComment {
  return {
    id: row.id,
    authorId: row.authorId,
    username: row.username,
    avatarId: row.avatarId,
    stageId: row.stageId,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    removedAt: row.removedAt,
    removalReason: row.removalReason,
    removedByAuthor: row.removedByAuthor,
    filterCategory: row.filterCategory,
    filterRule: row.filterRule,
    postId: row.siteUpdateId,
    postTitle: row.postTitle,
    postSlug: row.postSlug,
  }
}

export function listDevNewsComments(
  slug: string,
  limit = 25,
  offset = 0,
  viewerId: string | null = LOCAL_OWNER_USER_ID,
): { comments: NewsComment[]; total: number } | { error: string } {
  const update = getDevSiteUpdate(slug)
  if (!update) return { error: 'not_found' }
  const visible = ensureState()
    .comments.filter((row) => row.postSlug === slug && row.status === 'visible')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const slice = visible.slice(offset, offset + limit)
  return {
    comments: slice.map((row) => toPublicComment(row, viewerId)),
    total: visible.length,
  }
}

export function listDevModerationNewsComments(input: {
  status?: 'visible' | 'pending' | 'removed'
  limit?: number
  offset?: number
  postSlug?: string
}): { comments: DevModerationNewsComment[]; total: number; pendingTotal: number } {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100))
  const offset = Math.max(0, input.offset ?? 0)
  const filtered = ensureState()
    .comments.filter((row) => {
      if (input.status && row.status !== input.status) return false
      if (input.postSlug && row.postSlug !== input.postSlug) return false
      return true
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  return {
    comments: filtered.slice(offset, offset + limit).map(toModerationComment),
    total: filtered.length,
    pendingTotal: ensureState().comments.filter(
      (row) =>
        row.status === 'pending' &&
        (!input.postSlug || row.postSlug === input.postSlug),
    ).length,
  }
}

export function postDevNewsComment(
  slug: string,
  body: string,
  author: { userId: string; username: string; avatarId: string; stageId: string } = {
    userId: LOCAL_OWNER_USER_ID,
    username: LOCAL_OWNER_USERNAME,
    avatarId: DEFAULT_AVATAR_ID,
    stageId: DEFAULT_STAGE_ID,
  },
):
  | { ok: true; outcome: 'visible'; comment: NewsComment }
  | { ok: true; outcome: 'pending' }
  | { ok: false; error: string } {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'body_required' }
  if (trimmed.length > 1000) return { ok: false, error: 'body_too_long' }
  const update = getDevSiteUpdate(slug)
  if (!update) return { ok: false, error: 'not_found' }
  if (ensureState().commentBans.has(author.userId)) {
    return { ok: false, error: 'comment_banned' }
  }
  const normalized = normalizeNewsCommentBody(trimmed)
  const duplicate = ensureState().comments.some(
    (item) =>
      item.authorId === author.userId &&
      normalizeNewsCommentBody(item.body) === normalized &&
      Date.now() - new Date(item.createdAt).getTime() <= 24 * 60 * 60 * 1000,
  )
  if (duplicate) return { ok: false, error: 'spam_rejected' }
  const decision = classifyNewsCommentBody(trimmed)
  if (decision.action === 'reject') return { ok: false, error: 'spam_rejected' }
  const now = new Date().toISOString()
  const row: DevCommentRow = {
    id: crypto.randomUUID(),
    siteUpdateId: update.id,
    postSlug: update.slug,
    postTitle: update.title,
    authorId: author.userId,
    username: author.username,
    avatarId: author.avatarId,
    stageId: author.stageId,
    body: trimmed,
    status: decision.action === 'quarantine' ? 'pending' : 'visible',
    createdAt: now,
    updatedAt: now,
    removedAt: null,
    removalReason: null,
    removedByAuthor: false,
    filterCategory: decision.category,
    filterRule: decision.rule,
  }
  ensureState().comments.push(row)
  notify()
  return row.status === 'pending'
    ? { ok: true, outcome: 'pending' }
    : { ok: true, outcome: 'visible', comment: toPublicComment(row, author.userId) }
}

export function deleteDevMyNewsComment(
  commentId: string,
  authorId = LOCAL_OWNER_USER_ID,
): { ok: true } | { ok: false; error: string } {
  const row = ensureState().comments.find((item) => item.id === commentId)
  if (!row || row.authorId !== authorId || row.status !== 'visible') {
    return { ok: false, error: 'not_found' }
  }
  const now = new Date().toISOString()
  row.status = 'removed'
  row.removedAt = now
  row.removalReason = 'removed by author'
  row.removedByAuthor = true
  row.updatedAt = now
  notify()
  return { ok: true }
}

export function setDevNewsCommentStatus(input: {
  commentId: string
  status: 'visible' | 'removed'
  reason: string
}): { ok: true } | { ok: false; error: string } {
  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, error: 'reason_required' }
  const row = ensureState().comments.find((item) => item.id === input.commentId)
  if (!row) return { ok: false, error: 'not_found' }
  const now = new Date().toISOString()
  row.status = input.status
  row.updatedAt = now
  row.removedByAuthor = false
  if (input.status === 'removed') {
    row.removedAt = now
    row.removalReason = reason
  } else {
    row.removedAt = null
    row.removalReason = null
  }
  notify()
  return { ok: true }
}

export function issueDevCommentBan(targetUserId: string): { ok: true } | { ok: false; error: string } {
  if (!targetUserId) return { ok: false, error: 'invalid_target' }
  ensureState().commentBans.add(targetUserId)
  notify()
  return { ok: true }
}

export function revokeDevCommentBan(targetUserId: string): { ok: true } | { ok: false; error: string } {
  if (!targetUserId) return { ok: false, error: 'invalid_target' }
  ensureState().commentBans.delete(targetUserId)
  notify()
  return { ok: true }
}
