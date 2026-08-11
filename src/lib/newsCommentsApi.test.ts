import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGE_ID } from './avatarStages'
import {
  NEWS_COMMENT_MAX_LENGTH,
  newsCommentErrorMessage,
  parseNewsComment,
} from './newsCommentsApi'

describe('news comments API contracts', () => {
  it('parses a public comment without requiring private author data', () => {
    expect(
      parseNewsComment({
        id: '11111111-1111-1111-1111-111111111111',
        username: 'PanelReader',
        avatar_id: 'avatar_shadow_hunter',
        stage_id: 'stage_dusk_plaza',
        body: 'Loved this update.',
        status: 'visible',
        created_at: '2026-08-11T12:00:00Z',
        updated_at: '2026-08-11T12:00:00Z',
        is_mine: true,
      }),
    ).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      username: 'PanelReader',
      avatarId: 'avatar_shadow_hunter',
      stageId: 'stage_dusk_plaza',
      body: 'Loved this update.',
      status: 'visible',
      createdAt: '2026-08-11T12:00:00Z',
      updatedAt: '2026-08-11T12:00:00Z',
      isMine: true,
    })
  })

  it('falls back to the default stage when the author has none equipped', () => {
    const comment = parseNewsComment({
      id: '11111111-1111-1111-1111-111111111112',
      username: 'PanelReader',
      body: 'No cosmetics equipped.',
      status: 'visible',
      created_at: '2026-08-11T12:00:00Z',
      updated_at: '2026-08-11T12:00:00Z',
    })
    expect(comment?.stageId).toBe(DEFAULT_STAGE_ID)
  })

  it('rejects malformed comments and shares the server body limit', () => {
    expect(parseNewsComment({ id: 'missing-fields' })).toBeNull()
    expect(NEWS_COMMENT_MAX_LENGTH).toBe(1000)
  })

  it('maps moderation outcomes to safe user-facing messages', () => {
    expect(newsCommentErrorMessage('spam_rejected')).not.toContain('rule')
    expect(newsCommentErrorMessage('rate_limited')).toMatch(/try again/i)
    expect(newsCommentErrorMessage('unknown_internal_code')).toMatch(/could not submit/i)
  })
})
