import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_AVATAR_ID, STYLE_A_BASE } from '../lib/avatarComposition'
import { AVATAR_AWAKENINGS_ENABLED } from '../lib/avatarAwakening'
import { PixelAvatar } from './PixelAvatar'

describe('PixelAvatar', () => {
  it('renders a single whole-character PNG with an accessible description', () => {
    const html = renderToStaticMarkup(<PixelAvatar characterId={DEFAULT_AVATAR_ID} size="xl" />)

    expect(html).toContain('pixel-avatar-xl')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Default (Female)"')
    expect(html).not.toContain('<svg')
    expect(html).toContain(`src="${STYLE_A_BASE}/default-female.png?v=5"`)
    expect(html).not.toContain('pixel-avatar-canvas')
    expect(html.match(/<img/g)?.length).toBe(1)
  })

  it('renders the cropped decorative bust used by the account header', () => {
    const html = renderToStaticMarkup(
      <PixelAvatar characterId="avatar_shadow_hunter" size="sm" decorative />,
    )

    expect(html).toContain('pixel-avatar-sm')
    expect(html).toContain('is-bust')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('aria-label=')
    expect(html).toContain(`src="${STYLE_A_BASE}/shadow-hunter.png?v=5"`)
  })

  it('marks non-decorative avatars as images and hides the image alt text', () => {
    const html = renderToStaticMarkup(<PixelAvatar characterId={DEFAULT_AVATAR_ID} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label=')
    expect(html).toMatch(/alt=""/)
    expect(html).toContain('aria-hidden="true"')
  })

  it('falls back to the default avatar for unknown or missing character ids', () => {
    const missing = renderToStaticMarkup(<PixelAvatar />)
    const unknown = renderToStaticMarkup(<PixelAvatar characterId="not-a-character" />)
    expect(missing).toContain(`src="${STYLE_A_BASE}/default-female.png?v=5"`)
    expect(unknown).toContain(`src="${STYLE_A_BASE}/default-female.png?v=5"`)
  })

  it('keeps avatars on the static plate while awakenings are disabled in production', () => {
    expect(AVATAR_AWAKENINGS_ENABLED).toBe(false)
    const awakened = renderToStaticMarkup(
      <PixelAvatar characterId="avatar_plum_blossom_blade" size="xl" awakeningLevel={1} />,
    )
    expect(awakened).toContain('data-awakening="0"')
    expect(awakened).not.toContain('is-sprite-sheet')
    expect(awakened).toContain('plum-blossom-blade.png')
    expect(awakened).not.toContain('/awakened/')
    expect(awakened).not.toContain('data-fx=')
    expect(awakened).not.toContain('pixel-avatar-aura')

    const bust = renderToStaticMarkup(
      <PixelAvatar
        characterId="avatar_plum_blossom_blade"
        size="sm"
        awakeningLevel={1}
        decorative
      />,
    )
    expect(bust).toContain('data-awakening="0"')
    expect(bust).not.toContain('is-sprite-sheet')
  })

  it('keeps unregistered awakenings on the static PNG', () => {
    const html = renderToStaticMarkup(
      <PixelAvatar characterId="avatar_shadow_hunter" size="xl" awakeningLevel={2} />,
    )
    expect(html).toContain('data-awakening="0"')
    expect(html).not.toContain('is-sprite-sheet')
    expect(html).toContain(`src="${STYLE_A_BASE}/shadow-hunter.png?v=5"`)
    expect(html).not.toContain('pixel-avatar-aura')
  })
})
