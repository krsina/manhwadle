import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MultiplayerRoundProgress,
  type MultiplayerProgressRound,
} from './MultiplayerRoundProgress'

const rounds: MultiplayerProgressRound[] = [
  { index: 0, mode: 'summary', modeRound: 1, status: 'completed' },
  { index: 1, mode: 'summary', modeRound: 2, status: 'active' },
  { index: 2, mode: 'summary', modeRound: 3, status: 'pending' },
]

describe('MultiplayerRoundProgress', () => {
  it('marks finished rounds done and the current round current', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoundProgress rounds={rounds} currentIndex={1} />,
    )
    expect(html.match(/multiplayer-round-pip is-done/g)).toHaveLength(1)
    expect(html.match(/multiplayer-round-pip is-current/g)).toHaveLength(1)
    expect(html).toContain('aria-current="step"')
  })

  it('never marks the current round as done even after it completes', () => {
    const html = renderToStaticMarkup(
      <MultiplayerRoundProgress
        rounds={[{ index: 0, mode: 'cover', modeRound: 1, status: 'completed' }]}
        currentIndex={0}
      />,
    )
    expect(html).toContain('is-current')
    expect(html).not.toContain('is-done')
  })

  it('renders nothing without rounds', () => {
    expect(
      renderToStaticMarkup(<MultiplayerRoundProgress rounds={[]} currentIndex={null} />),
    ).toBe('')
  })
})
