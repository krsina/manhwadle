import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Manhwa } from '../../lib/anilist-types'
import { MultiplayerRoundReveal } from './MultiplayerRoundReveal'

function manhwa(id: number, title: string): Manhwa {
  return {
    id,
    title: { english: title, romaji: title, native: null },
    synonyms: [],
    description: '',
    genres: ['Action', 'Fantasy'],
    tags: [],
    status: 'Completed',
    publisher: null,
    startDate: { year: 2020, month: null, day: null },
    coverImage: `https://example.test/${id}.jpg`,
    siteUrl: null,
    characters: [],
  }
}

const catalog = [
  manhwa(1, 'The Answer'),
  manhwa(2, 'First Miss'),
  manhwa(3, 'Second Miss'),
]

describe('MultiplayerRoundReveal', () => {
  it('shows the answer and compact ordered guess trails', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoundReveal
        answerLabel="The Answer"
        answer={catalog[0]}
        attempts={[
          { userId: 'viewer', guessIds: [2, 1] },
          { userId: 'rival', guessIds: [3] },
        ]}
        members={[
          { userId: 'viewer', username: 'Krisna', isSelf: true },
          { userId: 'rival', username: 'Rival' },
        ]}
        catalog={catalog}
      />,
    )
    expect(html).toContain('The Answer')
    expect(html).toContain('First Miss')
    expect(html).toContain('Second Miss')
    expect(html).toContain('multiplayer-reveal-guess is-correct')
    expect(html).toContain('1/2 solved')
    expect(html).toContain('<em>you</em>')
  })

  it('uses the crowded two-column contract for five or more players', () => {
    const members = Array.from({ length: 8 }, (_, index) => ({
      userId: `user-${index}`,
      username: `Player ${index + 1}`,
    }))
    const html = renderToStaticMarkup(
      <MultiplayerRoundReveal
        answerLabel="The Answer"
        answer={catalog[0]}
        attempts={members.map((member) => ({ userId: member.userId, guessIds: [2, 3] }))}
        members={members}
        catalog={catalog}
      />,
    )
    expect(html).toContain('multiplayer-reveal is-crowded')
    expect(html).toContain('0/8 solved')
    expect(html.match(/multiplayer-reveal-player/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('renders nothing when neither an answer nor guesses are available', () => {
    expect(
      renderToStaticMarkup(
        <MultiplayerRoundReveal
          answerLabel={null}
          attempts={[{ userId: 'viewer', guessIds: null }]}
          members={[{ userId: 'viewer', username: 'Krisna' }]}
          catalog={catalog}
        />,
      ),
    ).toBe('')
  })
})
