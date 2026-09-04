import { describe, expect, it } from 'vitest'
import { gachaSpinEase } from './gachaMotion'

describe('gachaSpinEase', () => {
  it('starts at 0 and finishes at 1', () => {
    expect(gachaSpinEase(0)).toBe(0)
    expect(gachaSpinEase(1)).toBe(1)
    expect(gachaSpinEase(-1)).toBe(0)
    expect(gachaSpinEase(2)).toBe(1)
  })

  it('is strictly increasing', () => {
    let previous = 0
    for (let i = 1; i <= 40; i += 1) {
      const value = gachaSpinEase(i / 40)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })

  it('decelerates continuously instead of slamming from cruise to crawl', () => {
    const dt = 1 / 80
    const speeds: number[] = []
    for (let i = 0; i < 80; i += 1) {
      speeds.push((gachaSpinEase((i + 1) * dt) - gachaSpinEase(i * dt)) / dt)
    }
    for (let i = 1; i < speeds.length; i += 1) {
        expect(Math.abs(speeds[i]! - speeds[i - 1]!)).toBeLessThan(0.2)
    }
  })

  it('still crawls through the last tiles', () => {
    expect(gachaSpinEase(0.5)).toBeGreaterThan(0.55)
    expect(gachaSpinEase(0.5)).toBeLessThan(0.9)
    expect(gachaSpinEase(0.85)).toBeGreaterThan(0.9)
    expect(gachaSpinEase(0.85)).toBeLessThan(0.99)
    expect(gachaSpinEase(0.95)).toBeLessThan(1)
  })
})
