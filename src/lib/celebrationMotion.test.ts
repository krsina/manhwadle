import { describe, expect, it } from 'vitest'
import {
  bonusCelebratePlan,
  celebrationCanvases,
  celebrationMotionTier,
  confettiBurstPlan,
  confettiCanvasDpr,
} from './celebrationMotion'

describe('celebrationMotionTier', () => {
  it('keeps desktop mouse input on the full budget', () => {
    expect(celebrationMotionTier()).toBe('full')
  })

  it('drops to lite on coarse pointers, narrow viewports, or save-data', () => {
    expect(celebrationMotionTier({ coarsePointer: true })).toBe('lite')
    expect(celebrationMotionTier({ narrowViewport: true })).toBe('lite')
    expect(celebrationMotionTier({ saveData: true })).toBe('lite')
    expect(celebrationMotionTier({ reducedMotion: true })).toBe('lite')
  })
})

describe('confettiBurstPlan', () => {
  it('caps first-try particle counts on a phone-sized frame', () => {
    const lite = confettiBurstPlan(390, 844, true, 'lite')
    const full = confettiBurstPlan(390, 844, true, 'full')
    const liteTotal = lite.centerCount + lite.sideCount + lite.ringCount * lite.ringParticles
    const fullTotal = full.centerCount + full.sideCount + full.ringCount * full.ringParticles

    expect(lite.stars).toBe(false)
    expect(lite.rotate).toBe(false)
    expect(lite.ringCount).toBe(0)
    expect(liteTotal).toBeLessThan(60)
    expect(fullTotal).toBeGreaterThan(liteTotal * 3)
  })

  it('caps canvas backing store on the lite tier', () => {
    expect(confettiCanvasDpr(3, 'lite')).toBe(1)
    expect(confettiCanvasDpr(3, 'full')).toBe(2)
  })
})

describe('bonusCelebratePlan', () => {
  it('uses a single cheap burst on lite', () => {
    const lite = bonusCelebratePlan('lite')
    const full = bonusCelebratePlan('full')
    expect(lite.maxBursts).toBe(1)
    expect(lite.extraBurst).toBe(0)
    expect(lite.stars).toBe(0)
    expect(lite.rings).toBe(false)
    expect(lite.firstBurst).toBeLessThan(full.firstBurst)
    expect(lite.durationMs).toBeLessThan(full.durationMs)
  })
})

describe('celebrationCanvases', () => {
  it('does not stack first-try confetti on a double-solve', () => {
    expect(celebrationCanvases(true, true)).toEqual({ confetti: false, bonus: true })
    expect(celebrationCanvases(true, false)).toEqual({ confetti: true, bonus: false })
    expect(celebrationCanvases(false, false)).toEqual({ confetti: false, bonus: false })
  })
})
