import { describe, expect, it } from 'vitest'
import { GACHA_PULL_COST } from '../../lib/gachaWeekly'
import { GACHA_STUDIO_COPY } from './gachaSkins'

describe('gacha studio copy', () => {
  it('keeps shop-facing pull labels', () => {
    expect(GACHA_STUDIO_COPY.kicker).toBe('Banner')
    expect(GACHA_STUDIO_COPY.title).toBe('Character banner')
    expect(GACHA_STUDIO_COPY.cta).toBe('Pull x1')
    expect(GACHA_STUDIO_COPY.againCta).toBe('Pull again')
  })

  it('states the per-pull point cost in the banner description', () => {
    expect(GACHA_STUDIO_COPY.description).toContain(`◆ ${GACHA_PULL_COST} points`)
    expect(GACHA_STUDIO_COPY.description).toContain('all four modes')
  })
})
