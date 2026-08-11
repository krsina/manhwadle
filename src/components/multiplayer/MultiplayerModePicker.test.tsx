import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MULTIPLAYER_MODE_ORDER } from '../../lib/multiplayerTypes'
import { MultiplayerModePicker } from './MultiplayerModePicker'
import { MULTIPLAYER_MODE_META } from './multiplayerModeMeta'

describe('MultiplayerModePicker', () => {
  it('renders a card per mode and marks the selected ones active', () => {
    const html = renderToStaticMarkup(
      <MultiplayerModePicker selected={['summary', 'cover']} onChange={() => {}} />,
    )
    for (const mode of MULTIPLAYER_MODE_ORDER) {
      expect(html).toContain(MULTIPLAYER_MODE_META[mode].label)
    }
    expect(html.match(/multiplayer-mode-card/g)).toHaveLength(MULTIPLAYER_MODE_ORDER.length)
    expect(html.match(/multiplayer-mode-card is-active/g)).toHaveLength(2)
  })
})

describe('multiplayer mode metadata', () => {
  it('keeps labels in sync with the daily mode registry names', () => {
    expect(MULTIPLAYER_MODE_META.summary.label).toBe('Summary')
    expect(MULTIPLAYER_MODE_META.heardle.presentationKey).toBe('heardle')
  })
})
