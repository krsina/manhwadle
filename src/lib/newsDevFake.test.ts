import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteDevMyNewsComment,
  editDevMyNewsComment,
  getDevSiteUpdate,
  listDevModerationNewsComments,
  listDevNewsComments,
  listDevSiteUpdates,
  postDevNewsComment,
  resetNewsDevFakeForTests,
  setDevNewsCommentStatus,
} from './newsDevFake'
import {
  getLocalOwnerAccount,
  isLocalOwnerPreviewActive,
} from './localOwnerPreview'
import {
  resetOwnerUserModeCacheForTests,
  setOwnerUserModeEnabled,
} from './devAccess'

describe('newsDevFake', () => {
  afterEach(() => {
    resetNewsDevFakeForTests()
  })

  it('seeds published news posts and visible comments', () => {
    const updates = listDevSiteUpdates()
    expect(updates.length).toBeGreaterThanOrEqual(2)
    const primary = getDevSiteUpdate('comments-launch')
    expect(primary?.title).toMatch(/comments/i)
    const comments = listDevNewsComments('comments-launch')
    expect('error' in comments).toBe(false)
    if ('error' in comments) return
    expect(comments.total).toBeGreaterThan(0)
    expect(comments.comments.every((row) => row.status === 'visible')).toBe(true)
  })

  it('supports posting and soft-removing comments for local review', () => {
    const posted = postDevNewsComment('comments-launch', 'Local owner test comment')
    expect(posted.ok).toBe(true)
    if (!posted.ok || posted.outcome !== 'visible') return
    const removed = setDevNewsCommentStatus({
      commentId: posted.comment.id,
      status: 'removed',
      reason: 'preview remove',
    })
    expect(removed).toEqual({ ok: true })
    const queue = listDevModerationNewsComments({ status: 'removed' })
    expect(queue.comments.some((row) => row.id === posted.comment.id)).toBe(true)
  })

  it('allows blank staff removal reasons and author self-delete', () => {
    const posted = postDevNewsComment('comments-launch', 'Blank reason remove test')
    expect(posted.ok).toBe(true)
    if (!posted.ok || posted.outcome !== 'visible') return

    expect(
      setDevNewsCommentStatus({
        commentId: posted.comment.id,
        status: 'removed',
        reason: '',
      }),
    ).toEqual({ ok: true })

    const restored = setDevNewsCommentStatus({
      commentId: posted.comment.id,
      status: 'visible',
      reason: '',
    })
    expect(restored).toEqual({ ok: true })

    expect(deleteDevMyNewsComment(posted.comment.id)).toEqual({ ok: true })
  })

  it('lets authors edit their own comments', () => {
    const posted = postDevNewsComment('comments-launch', 'Editable comment body')
    expect(posted.ok).toBe(true)
    if (!posted.ok || posted.outcome !== 'visible') return

    const edited = editDevMyNewsComment(posted.comment.id, 'Edited comment body')
    expect(edited.ok).toBe(true)
    if (!edited.ok || edited.outcome !== 'visible') return
    expect(edited.comment.body).toBe('Edited comment body')
  })

  it('keeps filtered comments in the staff-only pending queue', () => {
    const held = postDevNewsComment(
      'comments-launch',
      'Read my full review at https://example.com/review',
    )
    expect(held).toEqual({ ok: true, outcome: 'pending' })

    const publicComments = listDevNewsComments('comments-launch')
    expect('error' in publicComments).toBe(false)
    if ('error' in publicComments) return
    expect(publicComments.comments.some((row) => row.body.includes('example.com'))).toBe(false)

    const queue = listDevModerationNewsComments({ status: 'pending' })
    expect(queue.pendingTotal).toBeGreaterThan(0)
    expect(queue.comments.some((row) => row.filterCategory === 'external_link')).toBe(true)
  })

  it('rejects exact recent duplicates', () => {
    const first = postDevNewsComment('comments-launch', 'A unique duplicate test')
    expect(first.ok).toBe(true)
    expect(postDevNewsComment('comments-launch', '  A UNIQUE duplicate test  ')).toEqual({
      ok: false,
      error: 'spam_rejected',
    })
  })
})

describe('localOwnerPreview', () => {
  afterEach(() => {
    setOwnerUserModeEnabled(false)
    resetOwnerUserModeCacheForTests()
  })

  it('exposes an owner account in Vite DEV builds', () => {
    expect(isLocalOwnerPreviewActive()).toBe(Boolean(import.meta.env.DEV))
    expect(getLocalOwnerAccount().staffRole).toBe('owner')
    expect(getLocalOwnerAccount().username).toBe('LocalOwner')
  })
})
