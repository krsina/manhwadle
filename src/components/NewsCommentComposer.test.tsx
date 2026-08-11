import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NEWS_COMMENT_MAX_LENGTH } from '../lib/newsCommentsApi'
import { NewsCommentComposer } from './NewsCommentComposer'

function render(props: Partial<Parameters<typeof NewsCommentComposer>[0]> = {}) {
  return renderToStaticMarkup(
    <NewsCommentComposer value="" onChange={() => {}} onSubmit={() => {}} {...props} />,
  )
}

describe('NewsCommentComposer', () => {
  it('renders the reply-bubble composer', () => {
    expect(render()).toContain('news-composer news-composer-bubble')
  })

  it('ties the label to the field', () => {
    const html = render({ inputId: 'preview-input' })
    expect(html).toContain('for="preview-input"')
    expect(html).toContain('id="preview-input"')
  })

  it('hides the counter until there is text and disables an empty submit', () => {
    expect(render()).not.toContain(`/ ${NEWS_COMMENT_MAX_LENGTH}`)
    expect(render()).toContain('disabled=""')
    expect(render({ value: 'hi' })).toContain(`2 / ${NEWS_COMMENT_MAX_LENGTH}`)
  })

  it('flags the counter once the body approaches the limit', () => {
    const long = 'x'.repeat(NEWS_COMMENT_MAX_LENGTH)
    expect(render({ value: long })).toContain('is-near-limit')
  })
})
