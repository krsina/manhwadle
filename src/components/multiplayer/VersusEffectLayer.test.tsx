import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VersusEffectLayer } from './VersusEffectLayer'

describe('VersusEffectLayer', () => {
  it('renders the requested tone and message', () => {
    const html = renderToStaticMarkup(
      <VersusEffectLayer effect="match-victory" message="Champion" />,
    )
    expect(html).toContain('is-match-victory')
    expect(html).toContain('is-gold')
    expect(html).toContain('Champion')
  })

  it('renders countdown numbers instead of a glyph', () => {
    const html = renderToStaticMarkup(
      <VersusEffectLayer effect="countdown" message="2" />,
    )
    expect(html).toContain('versus-effect-count')
    expect(html).toContain('>2<')
    expect(html).not.toContain('versus-effect-glyph')
  })

  it('renders nothing when inactive', () => {
    expect(
      renderToStaticMarkup(<VersusEffectLayer effect="round-win" active={false} />),
    ).toBe('')
  })
})
