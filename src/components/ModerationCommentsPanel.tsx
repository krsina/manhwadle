import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { PixelAvatar } from './PixelAvatar'
import { deleteMyNewsComment } from '../lib/newsCommentsApi'
import {
  TEMP_DURATION_OPTIONS,
  endsAtFromHours,
  moderationIssueCommentBan,
  moderationListNewsComments,
  moderationRevokeCommentBan,
  moderationSetNewsCommentStatus,
  type ModerationNewsComment,
} from '../lib/moderationApi'
import { newsPath } from '../lib/routes'

const PAGE_SIZE = 50

function holdCategoryLabel(category: string | null): string {
  if (!category) return 'Automated filter'
  const labels: Record<string, string> = {
    spam: 'Likely spam',
    malformed: 'Malformed content',
    harassment: 'Harassment or self-harm targeting',
    threat: 'Potential threat',
    sexual_content: 'Explicit sexual content',
    hate_speech: 'Potential hate speech',
    external_link: 'External link',
  }
  return labels[category] ?? category.replaceAll('_', ' ')
}

export function ModerationCommentsPanel() {
  const { account, user } = useAuth()
  const [comments, setComments] = useState<ModerationNewsComment[]>([])
  const [status, setStatus] = useState<'all' | 'visible' | 'pending' | 'removed'>('all')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await moderationListNewsComments({
      status: status === 'all' ? undefined : status,
      limit: PAGE_SIZE,
      offset,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setComments(result.comments)
    setTotal(result.total)
    setPendingTotal(result.pendingTotal)
  }, [offset, status])

  useEffect(() => {
    void load()
  }, [load])

  async function removeOwn(comment: ModerationNewsComment) {
    if (!window.confirm('Remove your comment?')) return
    setBusyId(comment.id)
    setError(null)
    setNotice(null)
    const result = await deleteMyNewsComment(comment.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice('Comment removed.')
    await load()
  }

  async function setCommentStatus(
    comment: ModerationNewsComment,
    next: 'visible' | 'removed',
  ) {
    const action =
      comment.status === 'pending' && next === 'visible'
        ? 'Approve'
        : next === 'removed'
          ? 'Remove'
          : 'Restore'
    const reasonRaw = window.prompt(
      `${action} this comment — optional reason (leave blank to skip):`,
      '',
    )
    if (reasonRaw === null) return
    setBusyId(comment.id)
    setError(null)
    setNotice(null)
    const result = await moderationSetNewsCommentStatus({
      commentId: comment.id,
      status: next,
      reason: reasonRaw.trim(),
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(
      next === 'removed'
        ? 'Comment removed.'
        : comment.status === 'pending'
          ? 'Comment approved.'
          : 'Comment restored.',
    )
    await load()
  }

  async function ban(comment: ModerationNewsComment) {
    const reason = window.prompt(`Ban ${comment.username} from comments — reason:`)?.trim()
    if (!reason) return
    const durationLabel = TEMP_DURATION_OPTIONS.map((option, index) =>
      `${index + 1}: ${option.label}`,
    ).join('\n')
    const choice = window.prompt(
      `Choose a temporary duration:\n${durationLabel}${account?.staffRole === 'owner' ? '\n5: Permanent' : ''}`,
      '2',
    )
    if (!choice) return
    const permanent = account?.staffRole === 'owner' && choice.trim() === '5'
    const option = TEMP_DURATION_OPTIONS[Number(choice) - 1]
    if (!permanent && !option) {
      setError('Choose a valid ban duration.')
      return
    }

    setBusyId(comment.id)
    setError(null)
    setNotice(null)
    const result = await moderationIssueCommentBan({
      targetUserId: comment.authorId,
      reason,
      permanent,
      endsAt: permanent ? undefined : endsAtFromHours(option!.hours),
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${comment.username} was banned from commenting.`)
  }

  async function revokeBan(comment: ModerationNewsComment) {
    const reason = window.prompt(`Revoke ${comment.username}'s comment ban — reason:`)?.trim()
    if (!reason) return
    setBusyId(comment.id)
    setError(null)
    setNotice(null)
    const result = await moderationRevokeCommentBan(comment.authorId, reason)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${comment.username}'s active comment ban was revoked.`)
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="moderation-comments-panel" aria-labelledby="staff-comments-title">
      <div className="moderation-section-heading">
        <div>
          <p className="modal-kicker">Comment modview</p>
          <h2 id="staff-comments-title">News comments</h2>
          <p>Review all comments, preserve moderation history, and restrict abusive accounts.</p>
          {pendingTotal > 0 && (
            <button
              type="button"
              className="btn btn-ghost moderation-pending-count"
              onClick={() => {
                setStatus('pending')
                setOffset(0)
              }}
            >
              {pendingTotal} pending review
            </button>
          )}
        </div>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status)
              setOffset(0)
            }}
          >
            <option value="all">All</option>
            <option value="visible">Visible</option>
            <option value="pending">Pending review</option>
            <option value="removed">Removed</option>
          </select>
        </label>
      </div>

      {error && <p className="auth-modal-error" role="alert">{error}</p>}
      {notice && <p className="moderation-notice" role="status">{notice}</p>}
      {loading && <p role="status">Loading comments…</p>}
      {!loading && comments.length === 0 && <p>No comments match this filter.</p>}

      {!loading && comments.length > 0 && (
        <ol className="moderation-comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="moderation-comment-card">
              <PixelAvatar characterId={comment.avatarId} size="sm" decorative />
              <div>
                <div className="news-comment-meta">
                  <strong>{comment.username}</strong>
                  <span>{comment.status}</span>
                  <time dateTime={comment.createdAt}>
                    {new Date(comment.createdAt).toLocaleString()}
                  </time>
                </div>
                <p>{comment.body}</p>
                {comment.status === 'pending' && (
                  <p className="moderation-comment-reason">
                    Held for: {holdCategoryLabel(comment.filterCategory)}
                    {comment.filterRule ? ` (${comment.filterRule})` : ''}
                  </p>
                )}
                <p className="moderation-comment-post">
                  On <Link to={newsPath(comment.postSlug)}>{comment.postTitle}</Link>
                </p>
                {comment.removalReason && (
                  <p className="moderation-comment-reason">
                    Removal reason: {comment.removalReason}
                  </p>
                )}
                <div className="news-comment-actions">
                  {user?.id != null &&
                    comment.authorId === user.id &&
                    (comment.status === 'visible' || comment.status === 'pending') && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void removeOwn(comment)}
                      >
                        Remove
                      </button>
                    )}
                  {comment.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === comment.id}
                      onClick={() => void setCommentStatus(comment, 'visible')}
                    >
                      Approve
                    </button>
                  )}
                  {comment.status === 'pending' &&
                    !(user?.id != null && comment.authorId === user.id) && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void setCommentStatus(comment, 'removed')}
                      >
                        Remove
                      </button>
                    )}
                  {comment.status === 'visible' &&
                    !(user?.id != null && comment.authorId === user.id) && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void setCommentStatus(comment, 'removed')}
                      >
                        Remove
                      </button>
                    )}
                  {comment.status === 'removed' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === comment.id}
                      onClick={() => void setCommentStatus(comment, 'visible')}
                    >
                      Restore
                    </button>
                  )}
                  {!(user?.id != null && comment.authorId === user.id) && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void ban(comment)}
                      >
                        Ban author
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === comment.id}
                        onClick={() => void revokeBan(comment)}
                      >
                        Revoke comment ban
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {pages > 1 && (
        <div className="news-comments-pagination">
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
