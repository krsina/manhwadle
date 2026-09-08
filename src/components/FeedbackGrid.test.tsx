import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { compareGuess } from '../lib/compare'
import { makeManhwa } from '../lib/testFixtures'
import { FeedbackGrid } from './FeedbackGrid'

describe('FeedbackGrid title keywords', () => {
  it('wraps every matching title word in a green keyword mark', () => {
    const answer = makeManhwa({
      id: 1,
      title: { english: 'Regression Warrior Mage', romaji: null, native: null },
    })
    const guess = makeManhwa({
      id: 2,
      title: { english: 'MAGE: Regression Protocol', romaji: null, native: null },
    })

    const html = renderToStaticMarkup(
      <FeedbackGrid rows={[compareGuess(guess, answer)]} />,
    )

    expect(html).toContain('class="feedback-title-keyword">MAGE</mark>')
    expect(html).toContain('class="feedback-title-keyword">Regression</mark>')
    expect(html).not.toContain('class="feedback-title-keyword">Protocol</mark>')
  })
})
