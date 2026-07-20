import { describe, expect, it } from 'vitest'
import {
  bustSourceRect,
  snapPixelArtDisplaySize,
  snapPixelArtScale,
} from './pixelArtScale'

describe('snapPixelArtDisplaySize', () => {
  it('only uses exact integer scales from 256', () => {
    expect(snapPixelArtDisplaySize(31.7)).toBe(16)
    expect(snapPixelArtDisplaySize(40.2)).toBe(32)
    expect(snapPixelArtDisplaySize(100)).toBe(64)
    expect(snapPixelArtDisplaySize(112)).toBe(64)
    expect(snapPixelArtDisplaySize(128)).toBe(128)
    expect(snapPixelArtDisplaySize(130)).toBe(128)
  })
})

describe('snapPixelArtScale', () => {
  it('maps fractional DPR onto whole device pixels with exact scales', () => {
    // 110 CSS × 1.25 DPR → 137 device → 128 (exact 2× downscale)
    const scale = snapPixelArtScale(110, 1.25)
    expect(scale.devicePx).toBe(128)
    expect(scale.cssPx).toBeCloseTo(102.4, 5)
  })

  it('stays crisp at 150% display scaling', () => {
    const scale = snapPixelArtScale(100, 1.5)
    expect(scale.devicePx).toBe(128)
    expect(scale.cssPx).toBeCloseTo(128 / 1.5, 5)
  })

  it('uses 1:1 device pixels when zoomed to DPR 2 with enough room', () => {
    const scale = snapPixelArtScale(140, 2)
    expect(scale.devicePx).toBe(256)
    expect(scale.cssPx).toBe(128)
  })

  it('never picks muddy in-between sizes like 96 or 112', () => {
    expect(snapPixelArtScale(96, 1).devicePx).toBe(64)
    expect(snapPixelArtScale(112, 1).devicePx).toBe(64)
    expect(snapPixelArtScale(120, 1).devicePx).toBe(64)
  })
})

describe('bustSourceRect', () => {
  it('crops a tight head-focused square inside the 256 plate', () => {
    const r = bustSourceRect(256)
    expect(r.sw).toBe(r.sh)
    expect(r.sw).toBeLessThan(Math.round(256 / 1.9))
    expect(r.sx).toBeGreaterThanOrEqual(0)
    expect(r.sy).toBeGreaterThanOrEqual(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(256)
    expect(r.sy + r.sh).toBeLessThanOrEqual(256)
    // Focus stays in the upper half (head / shoulders).
    expect(r.sy + r.sh / 2).toBeLessThan(256 * 0.5)
  })
})
