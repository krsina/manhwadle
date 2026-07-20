import { describe, expect, it } from 'vitest'
import { streakTier } from './streakIntensity'

describe('streakTier', () => {
  it('maps streak length to intensity tiers', () => {
    expect(streakTier(0)).toBe('cold')
    expect(streakTier(2)).toBe('ember')
    expect(streakTier(5)).toBe('flame')
    expect(streakTier(10)).toBe('blaze')
    expect(streakTier(20)).toBe('inferno')
    expect(streakTier(30)).toBe('legendary')
  })
})
