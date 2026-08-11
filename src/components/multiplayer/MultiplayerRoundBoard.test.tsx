import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MultiplayerModeClue,
  type MultiplayerBoardRound,
} from './MultiplayerRoundBoard'

const cases: MultiplayerBoardRound[] = [
  {
    id: 'summary-round',
    mode: 'summary',
    clue: { blurbs: ['Opening blurb', 'Second blurb'] },
  },
  {
    id: 'character-round',
    mode: 'character',
    clue: { image_url: '/character.jpg', focus_x: 42, focus_y: 31 },
  },
  {
    id: 'cover-round',
    mode: 'cover',
    clue: { image_url: '/cover.jpg', focus_x: 48, focus_y: 37 },
  },
  {
    id: 'heardle-round',
    mode: 'heardle',
    clue: {
      id: 'song',
      youtube_id: 'video',
      source: 'webtoon_ost',
      kind: 'vocal',
      start_sec: 2,
    },
  },
]

describe('MultiplayerModeClue', () => {
  it.each(cases)('renders the $mode server clue adapter', (round) => {
    const html = renderToStaticMarkup(
      <MultiplayerModeClue round={round} failedGuesses={1} finished={false} />,
    )
    expect(html).toContain('clue')
    expect(html).not.toContain('Reveal more')
  })
})
