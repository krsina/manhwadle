import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MultiplayerSurrenderControl } from './MultiplayerSurrenderControl'

describe('MultiplayerSurrenderControl', () => {
  it('renders the approved compact control without an open modal', () => {
    const html = renderToStaticMarkup(
      <MultiplayerSurrenderControl onConfirm={vi.fn()} />,
    )
    expect(html).toContain('class="surrender-toggle"')
    expect(html).toContain('I give up')
    expect(html).not.toContain('surrender-modal')
  })

  it('forwards the disabled state to the button', () => {
    const html = renderToStaticMarkup(
      <MultiplayerSurrenderControl disabled onConfirm={vi.fn()} />,
    )
    expect(html).toContain('disabled=""')
  })
})
