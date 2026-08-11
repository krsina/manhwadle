import { describe, expect, it } from 'vitest'
import { percent } from './analyticsApi'

describe('analytics formulas', () => {
  it('uses explicit zero-safe rate denominators', () => {
    expect(percent(5, 10)).toBe(50)
    expect(percent(1, 3)).toBeCloseTo(33.333)
    expect(percent(4, 0)).toBe(0)
  })
})
