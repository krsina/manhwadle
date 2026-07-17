import { describe, expect, it } from 'vitest'
import {
  buildHardRevealLadder,
  buildRevealLadder,
  revealedBlurbCount,
} from './blurbs'

describe('blurbs', () => {
  it('buildRevealLadder appends full description after authored tiers', () => {
    expect(buildRevealLadder(['t0', 't1'], 'Full desc')).toEqual([
      't0',
      't1',
      'Full desc',
    ])
  })

  it('buildHardRevealLadder keeps only t0', () => {
    expect(buildHardRevealLadder(['t0 vague', 't1 more', 'full'])).toEqual([
      't0 vague',
    ])
    expect(buildHardRevealLadder(undefined)).toEqual([
      'No summary available for today’s manhwa.',
    ])
  })

  it('revealedBlurbCount grows with failed guesses and unlocks all when finished', () => {
    expect(revealedBlurbCount(0, 3)).toBe(1)
    expect(revealedBlurbCount(1, 3)).toBe(2)
    expect(revealedBlurbCount(5, 3)).toBe(3)
    expect(revealedBlurbCount(0, 3, { finished: true })).toBe(3)
    expect(revealedBlurbCount(4, 1)).toBe(1)
  })
})
