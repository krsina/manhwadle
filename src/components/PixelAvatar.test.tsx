import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  avatarAssetUrl,
  DEFAULT_AVATAR_ID,
} from '../lib/avatarComposition'
import { PixelAvatar } from './PixelAvatar'

describe('PixelAvatar', () => {
  it('renders a single whole-character PNG with an accessible description', () => {
    const html = renderToStaticMarkup(<PixelAvatar characterId={DEFAULT_AVATAR_ID} size="xl" />)

    expect(html).toContain('pixel-avatar-xl')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Default (Female)"')
    expect(html).not.toContain('<svg')
    expect(html).toContain(`src="${avatarAssetUrl(DEFAULT_AVATAR_ID)}"`)
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
    expect(html).toContain(`src="${avatarAssetUrl('avatar_shadow_hunter')}"`)
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
    const fallback = avatarAssetUrl(DEFAULT_AVATAR_ID)
    expect(missing).toContain(`src="${fallback}"`)
    expect(unknown).toContain(`src="${fallback}"`)
  })

  it('renders the static plate with no leftover awakening or sprite-sheet markup', () => {
    const html = renderToStaticMarkup(
      <PixelAvatar characterId="avatar_plum_blossom_blade" size="xl" />,
    )
    expect(html).toContain('plum-blossom-blade.png')
    expect(html).not.toContain('/awakened/')
    expect(html).not.toContain('is-sprite-sheet')
    expect(html).not.toContain('data-awakening')
    expect(html).not.toContain('data-sheet-frame')
    expect(html).not.toContain('pixel-avatar-aura')
  })
})
