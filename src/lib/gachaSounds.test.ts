import { describe, expect, it } from 'vitest'
import {
  beginGachaSpinSound,
  gachaSoundSupported,
  gachaTickMinGapMs,
  gachaUnlockNoteCount,
  landGachaSpinSound,
  playGachaTickSound,
  stopGachaSpinSound,
  warmGachaAudio,
} from './gachaSounds'

describe('gachaSounds', () => {
  it('reports no Web Audio support in the unit-test environment', () => {
    expect(gachaSoundSupported()).toBe(false)
  })

  it('scales unlock richness with rarity', () => {
    expect(gachaUnlockNoteCount('common')).toBeLessThan(gachaUnlockNoteCount('rare'))
    expect(gachaUnlockNoteCount('rare')).toBeLessThan(gachaUnlockNoteCount('epic'))
    expect(gachaUnlockNoteCount('epic')).toBeLessThan(gachaUnlockNoteCount('legendary'))
  })

  it('spaces ticks farther apart during the crawl', () => {
    expect(gachaTickMinGapMs(0.2)).toBeLessThan(gachaTickMinGapMs(0.8))
  })

  it('is safe to call without an AudioContext', async () => {
    await expect(warmGachaAudio()).resolves.toBeUndefined()
    const session = beginGachaSpinSound('legendary')
    playGachaTickSound(0.5, session)
    landGachaSpinSound('legendary', session)
    playGachaTickSound(0.5, session)
    landGachaSpinSound('rare', session)
    stopGachaSpinSound()
    expect(session).toBeGreaterThan(0)
  })
})
