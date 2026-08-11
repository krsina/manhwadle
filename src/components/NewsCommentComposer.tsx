import type { FormEvent } from 'react'
import { StagedAvatar } from './StagedAvatar'
import { NEWS_COMMENT_MAX_LENGTH } from '../lib/newsCommentsApi'

export function NewsCommentComposer({
  value,
  onChange,
  onSubmit,
  avatarId,
  stageId,
  busy = false,
  inputId = 'news-comment-body',
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: (event: FormEvent) => void
  avatarId?: string | null
  stageId?: string | null
  busy?: boolean
  inputId?: string
}) {
  const nearLimit = value.length >= NEWS_COMMENT_MAX_LENGTH * 0.9

  return (
    <form className="news-composer news-composer-bubble" onSubmit={onSubmit}>
      <span className="news-composer-avatar">
        <StagedAvatar avatarId={avatarId} stageId={stageId} />
      </span>
      <div className="news-composer-main">
        <div className="news-composer-head">
          <label htmlFor={inputId} className="news-composer-label">
            Add a comment
          </label>
        </div>
        <textarea
          id={inputId}
          className="news-composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={NEWS_COMMENT_MAX_LENGTH}
          rows={3}
          placeholder="Share a thought. Tag spoilers."
          disabled={busy}
        />
        <div className="news-composer-footer">
          <span className={`news-composer-count${nearLimit ? ' is-near-limit' : ''}`}>
            {value.length > 0 ? `${value.length} / ${NEWS_COMMENT_MAX_LENGTH}` : ''}
          </span>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || value.trim().length === 0}
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}
