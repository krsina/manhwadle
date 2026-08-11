import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Manhwa } from '../../lib/anilist-types'
import {
  MultiplayerMatchRecap,
  type MultiplayerRecapEntry,
} from './MultiplayerMatchRecap'

function manhwa(overrides: Partial<Manhwa> = {}): Manhwa {
  return {
    id: 1,
    title: { english: 'Solo Leveling', romaji: 'Na Honjaman Level Up', native: '나 혼자만 레벨업' },
    synonyms: [],
    description: '',
    genres: ['Action', 'Adventure', 'Fantasy', 'Drama'],
    tags: [],
    status: 'Completed',
    publisher: 'Tappytoon',
    startDate: { year: 2018, month: null, day: null },
    coverImage: 'https://example.test/solo.jpg',
    siteUrl: 'https://anilist.co/manga/105398',
    characters: [],
    ...overrides,
  }
}

function entry(overrides: Partial<MultiplayerRecapEntry> = {}): MultiplayerRecapEntry {
  return {
    roundIndex: 0,
    mode: 'summary',
    modeRound: 1,
    answerId: 1,
    answerLabel: 'Solo Leveling',
    solvedBy: ['You'],
    ...overrides,
  }
}

describe('MultiplayerMatchRecap', () => {
  it('shows cover art, title, and daily-style metadata per round', () => {
    const html = renderToStaticMarkup(
      <MultiplayerMatchRecap entries={[entry()]} catalog={[manhwa()]} roundsPerMode={3} />,
    )
    expect(html).toContain('https://example.test/solo.jpg')
    expect(html).toContain('Solo Leveling')
    expect(html).toContain('Na Honjaman Level Up')
    expect(html).toContain('2018')
    expect(html).toContain('Completed')
    expect(html).toContain('Action · Adventure · Fantasy')
    expect(html).toContain('anilist.co/manga/105398')
    expect(html).toContain('Solved by You')
  })

  it('orders rounds by play order and lists multiple solvers', () => {
    const html = renderToStaticMarkup(
      <MultiplayerMatchRecap
        entries={[
          entry({ roundIndex: 2, mode: 'cover', modeRound: 3, solvedBy: ['You', 'ari', 'bo'] }),
          entry({ roundIndex: 1, mode: 'summary', modeRound: 2, solvedBy: [] }),
        ]}
        catalog={[manhwa()]}
        roundsPerMode={3}
      />,
    )
    expect(html.indexOf('R2')).toBeLessThan(html.indexOf('R3'))
    expect(html).toContain('Nobody solved it')
    expect(html).toContain('Solved by You, ari and bo')
  })

  it('falls back to the server label when the title is missing from the catalog', () => {
    const html = renderToStaticMarkup(
      <MultiplayerMatchRecap
        entries={[entry({ answerId: 404, answerLabel: 'Unknown Title' })]}
        catalog={[manhwa()]}
        roundsPerMode={3}
      />,
    )
    expect(html).toContain('Unknown Title')
    expect(html).toContain('No cover')
  })

  it('renders nothing before any round has been revealed', () => {
    expect(
      renderToStaticMarkup(
        <MultiplayerMatchRecap entries={[]} catalog={[manhwa()]} roundsPerMode={3} />,
      ),
    ).toBe('')
  })
})
