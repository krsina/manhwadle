import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { NewsCommentComposer } from './NewsCommentComposer'
import { StagedAvatar } from './StagedAvatar'
import {
  deleteMyNewsComment,
  fetchNewsComments,
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
    setNotice('Comment removed.')
    await load()
  }

  async function moderateStatus(comment: ModerationNewsComment) {
    const nextStatus = comment.status === 'visible' ? 'removed' : 'visible'
    const actionLabel =
      comment.status === 'pending'
        ? 'Approve'
        : nextStatus === 'removed'
          ? 'Remove'
          : 'Restore'
    const reason = window.prompt(
      `${actionLabel} comment — enter a reason:`,
    )?.trim()
    if (!reason) return
    setBusyId(comment.id)
    setError(null)
    const result = await moderationSetNewsCommentStatus({
      commentId: comment.id,
      status: nextStatus,
      reason,
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(nextStatus === 'removed' ? 'Comment removed.' : 'Comment restored.')
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
            return (
              <li
                key={comment.id}
                className={`news-comment${comment.status === 'removed' ? ' is-removed' : ''}`}
              >
                <StagedAvatar avatarId={comment.avatarId} stageId={comment.stageId} />
                <div className="news-comment-content">
                  <div className="news-comment-meta">
                    <strong>{comment.username}</strong>
                    <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                    {comment.status === 'removed' && <span>Removed</span>}
                    {comment.status === 'pending' && <span>Pending review</span>}
                  </div>
                  <p>{comment.body}</p>
                  <div className="news-comment-actions">
                    {!staffComment && 'isMine' in comment && comment.isMine && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void removeOwn(comment.id)}
                      >
                        Remove
                      </button>
                    )}
                    {staffComment && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === comment.id}
                          onClick={() => void moderateStatus(staffComment)}
                        >
                          {comment.status === 'visible'
                            ? 'Remove'
                            : comment.status === 'pending'
                              ? 'Approve'
                              : 'Restore'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === comment.id}
                          onClick={() => void banAuthor(staffComment, false)}
                        >
                          Ban 7d
                        </button>
                        {account?.staffRole === 'owner' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === comment.id}
                            onClick={() => void banAuthor(staffComment, true)}
                          >
                            Ban permanently
                          </button>
                        )}
                      </>
                    )}
                  </div>
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
          <span>Page {page} of {pages}</span>
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
