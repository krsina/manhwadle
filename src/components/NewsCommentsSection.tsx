import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { NewsCommentComposer } from './NewsCommentComposer'
import { NewsCommentMenu, type NewsCommentMenuItem } from './NewsCommentMenu'
import { StagedAvatar } from './StagedAvatar'
import {
  deleteMyNewsComment,
  editMyNewsComment,
  fetchNewsComments,
  NEWS_COMMENT_MAX_LENGTH,
  newsCommentErrorMessage,
  postNewsComment,
  type NewsComment,
} from '../lib/newsCommentsApi'
import { preflightNewsComment } from '../lib/newsCommentModeration'
import {
  canUseModerationUi,
  endsAtFromHours,
  moderationIssueCommentBan,
  moderationListNewsComments,
  moderationSetNewsCommentStatus,
  type ModerationNewsComment,
} from '../lib/moderationApi'

const PAGE_SIZE = 25

function formatCommentTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function NewsCommentsSection({ slug }: { slug: string }) {
  const { user, account, loading: authLoading } = useAuth()
  const isStaff = canUseModerationUi(account?.staffRole)
  const [comments, setComments] = useState<(NewsComment | ModerationNewsComment)[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = isStaff
      ? await moderationListNewsComments({ postSlug: slug, limit: PAGE_SIZE, offset })
      : await fetchNewsComments(slug, PAGE_SIZE, offset)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setComments(result.comments)
    setTotal(result.total)
  }, [isStaff, offset, slug])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextBody = body.trim()
    const preflight = preflightNewsComment(nextBody)
    if (!preflight.ok) {
      setError(newsCommentErrorMessage(preflight.error))
      return
    }
    setBusyId('new')
    setError(null)
    setNotice(null)
    const result = await postNewsComment(slug, nextBody)
    setBusyId(null)
    if (!result.ok) {
      setError(newsCommentErrorMessage(result.error))
      return
    }
    setBody('')
    if (result.outcome === 'pending') {
      setNotice('Your comment was submitted for moderator review.')
      return
    }
    setNotice('Comment posted.')
    if (offset === 0) {
      await load()
    } else {
      setOffset(0)
    }
  }

  function startEdit(comment: NewsComment | ModerationNewsComment) {
    setEditingId(comment.id)
    setEditBody(comment.body)
    setError(null)
    setNotice(null)
  }

  async function saveEdit(commentId: string) {
    const nextBody = editBody.trim()
    const preflight = preflightNewsComment(nextBody)
    if (!preflight.ok) {
      setError(newsCommentErrorMessage(preflight.error))
      return
    }
    setBusyId(commentId)
    setError(null)
    setNotice(null)
    const result = await editMyNewsComment(commentId, nextBody)
    setBusyId(null)
    if (!result.ok) {
      setError(newsCommentErrorMessage(result.error))
      return
    }
    setEditingId(null)
    setEditBody('')
    if (result.outcome === 'pending') {
      setNotice('Your edit was submitted for moderator review.')
      await load()
      return
    }
    setNotice('Comment updated.')
    await load()
  }

  async function removeOwn(commentId: string) {
    if (!window.confirm('Remove your comment?')) return
    setBusyId(commentId)
    setError(null)
    const result = await deleteMyNewsComment(commentId)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (editingId === commentId) {
      setEditingId(null)
      setEditBody('')
    }
    setNotice('Comment removed.')
    await load()
  }

  async function moderateStatus(
    comment: ModerationNewsComment,
    nextStatus: 'visible' | 'removed',
  ) {
    const actionLabel =
      comment.status === 'pending' && nextStatus === 'visible'
        ? 'Approve'
        : nextStatus === 'removed'
          ? 'Remove'
          : 'Restore'
    const reasonRaw = window.prompt(
      `${actionLabel} comment — optional reason (leave blank to skip):`,
      '',
    )
    if (reasonRaw === null) return
    setBusyId(comment.id)
    setError(null)
    const result = await moderationSetNewsCommentStatus({
      commentId: comment.id,
      status: nextStatus,
      reason: reasonRaw.trim(),
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(
      nextStatus === 'removed'
        ? 'Comment removed.'
        : comment.status === 'pending'
          ? 'Comment approved.'
          : 'Comment restored.',
    )
    await load()
  }

  async function banAuthor(comment: ModerationNewsComment, permanent: boolean) {
    const reason = window.prompt(
      `${permanent ? 'Permanently ban' : 'Ban for 7 days'} ${comment.username} from comments — reason:`,
    )?.trim()
    if (!reason) return
    setBusyId(comment.id)
    setError(null)
    const result = await moderationIssueCommentBan({
      targetUserId: comment.authorId,
      reason,
      permanent,
      endsAt: permanent ? undefined : endsAtFromHours(24 * 7),
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${comment.username} can no longer post comments.`)
  }

  function menuItemsFor(
    comment: NewsComment | ModerationNewsComment,
    staffComment: ModerationNewsComment | null,
    isOwn: boolean,
  ): NewsCommentMenuItem[] {
    const items: NewsCommentMenuItem[] = []
    const canSelfEdit =
      isOwn && (comment.status === 'visible' || comment.status === 'pending')
    const canSelfRemove =
      isOwn && (comment.status === 'visible' || comment.status === 'pending')

    if (canSelfEdit) {
      items.push({
        id: 'edit',
        label: 'Edit',
        onSelect: () => startEdit(comment),
      })
    }
    if (canSelfRemove) {
      items.push({
        id: 'remove-own',
        label: 'Remove',
        danger: true,
        onSelect: () => {
          void removeOwn(comment.id)
        },
      })
    }

    if (staffComment && !isOwn) {
      if (comment.status === 'pending') {
        items.push({
          id: 'approve',
          label: 'Approve',
          onSelect: () => {
            void moderateStatus(staffComment, 'visible')
          },
        })
        items.push({
          id: 'remove',
          label: 'Remove',
          danger: true,
          onSelect: () => {
            void moderateStatus(staffComment, 'removed')
          },
        })
      } else if (comment.status === 'visible') {
        items.push({
          id: 'remove',
          label: 'Remove',
          danger: true,
          onSelect: () => {
            void moderateStatus(staffComment, 'removed')
          },
        })
      } else {
        items.push({
          id: 'restore',
          label: 'Restore',
          onSelect: () => {
            void moderateStatus(staffComment, 'visible')
          },
        })
      }
      items.push({
        id: 'ban-7d',
        label: 'Ban 7 days',
        danger: true,
        onSelect: () => {
          void banAuthor(staffComment, false)
        },
      })
      if (account?.staffRole === 'owner') {
        items.push({
          id: 'ban-permanent',
          label: 'Ban permanently',
          danger: true,
          onSelect: () => {
            void banAuthor(staffComment, true)
          },
        })
      }
    }

    if (staffComment && isOwn && comment.status === 'pending') {
      items.push({
        id: 'approve-own',
        label: 'Approve',
        onSelect: () => {
          void moderateStatus(staffComment, 'visible')
        },
      })
    }
    if (staffComment && isOwn && comment.status === 'removed') {
      items.push({
        id: 'restore-own',
        label: 'Restore',
        onSelect: () => {
          void moderateStatus(staffComment, 'visible')
        },
      })
    }

    return items
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="news-comments" aria-labelledby="news-comments-title">
      <div className="news-comments-heading">
        <div>
          <p className="modal-kicker">Community</p>
          <h2 id="news-comments-title">Comments</h2>
        </div>
        <span>{total}</span>
      </div>

      {!authLoading && !user && (
        <p className="news-comments-signin">Sign in from the account menu to join the discussion.</p>
      )}
      {user && (
        <NewsCommentComposer
          value={body}
          onChange={setBody}
          onSubmit={handleSubmit}
          avatarId={account?.equippedAvatarId}
          stageId={account?.equippedStageId}
          busy={busyId === 'new'}
        />
      )}

      {error && <p className="auth-modal-error" role="alert">{error}</p>}
      {notice && <p className="moderation-notice" role="status">{notice}</p>}
      {loading && <p className="updates-status" role="status">Loading comments…</p>}
      {!loading && comments.length === 0 && (
        <p className="news-comments-empty">No comments yet. Start the conversation.</p>
      )}

      {!loading && comments.length > 0 && (
        <ol className="news-comment-list">
          {comments.map((comment) => {
            const staffComment = 'authorId' in comment ? comment : null
            const isOwn =
              ('isMine' in comment && comment.isMine) ||
              (staffComment != null && user?.id != null && staffComment.authorId === user.id)
            const menuItems = menuItemsFor(comment, staffComment, isOwn)
            const isEditing = editingId === comment.id
            const nearLimit = editBody.length >= NEWS_COMMENT_MAX_LENGTH * 0.9
            return (
              <li
                key={comment.id}
                className={`news-comment${comment.status === 'removed' ? ' is-removed' : ''}`}
              >
                <StagedAvatar avatarId={comment.avatarId} stageId={comment.stageId} />
                <div className="news-comment-content">
                  <div className="news-comment-top">
                    <div className="news-comment-meta">
                      <strong>{comment.username}</strong>
                      <time dateTime={comment.createdAt}>
                        {formatCommentTime(comment.createdAt)}
                      </time>
                      {comment.status === 'removed' && <span>Removed</span>}
                      {comment.status === 'pending' && <span>Pending review</span>}
                    </div>
                    <NewsCommentMenu
                      items={menuItems}
                      disabled={busyId === comment.id || isEditing}
                      label={`Actions for ${comment.username}'s comment`}
                    />
                  </div>
                  {isEditing ? (
                    <div className="news-comment-edit">
                      <textarea
                        className="news-composer-input"
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={NEWS_COMMENT_MAX_LENGTH}
                        rows={3}
                        disabled={busyId === comment.id}
                        aria-label="Edit comment"
                      />
                      <div className="news-comment-edit-footer">
                        <span
                          className={`news-composer-count${nearLimit ? ' is-near-limit' : ''}`}
                        >
                          {editBody.length > 0
                            ? `${editBody.length} / ${NEWS_COMMENT_MAX_LENGTH}`
                            : ''}
                        </span>
                        <div className="news-comment-edit-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === comment.id}
                            onClick={() => {
                              setEditingId(null)
                              setEditBody('')
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={
                              busyId === comment.id ||
                              editBody.trim().length === 0 ||
                              editBody.trim() === comment.body.trim()
                            }
                            onClick={() => void saveEdit(comment.id)}
                          >
                            {busyId === comment.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p>{comment.body}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {pages > 1 && (
        <div className="news-comments-pagination" aria-label="Comment pages">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  )
}
