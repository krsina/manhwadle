import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MULTIPLAYER_POOL_SOURCES } from '../../lib/multiplayerTypes'
import { MultiplayerPoolPicker } from './MultiplayerPoolPicker'
import { multiplayerPoolLabel } from './multiplayerPoolMeta'

describe('MultiplayerPoolPicker', () => {
  it('renders every explicit source and marks the selected source', () => {
    const html = renderToStaticMarkup(
      <MultiplayerPoolPicker
        value="collaborative_lists"
        onChange={() => {}}
      />,
    )
    expect(html.match(/type="radio"/g)).toHaveLength(
      MULTIPLAYER_POOL_SOURCES.length,
    )
    expect(html).toContain('Collaborative lists')
    expect(html.match(/is-selected/g)).toHaveLength(1)
  })

  it('provides player-facing source labels', () => {
    expect(multiplayerPoolLabel('action')).toBe('Action')
    expect(multiplayerPoolLabel('both')).toBe('Both')
  })
})
