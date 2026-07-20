import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_DEFINITIONS } from './achievements'
import {
  advanceAccountMenuPressCount,
  advanceKonamiSequence,
  KONAMI_SEQUENCE,
} from './secretEvents'

describe('secret achievements catalog', () => {
  it('includes hush-hush secrets with balanced point tiers', () => {
    const secrets = ACHIEVEMENT_DEFINITIONS.filter((d) => d.category === 'secret')
    expect(secrets.length).toBe(27)
    expect(secrets.every((d) => d.metric === 'secret_flag')).toBe(true)
    expect(
      secrets.every((d) => [25, 50, 100, 200].includes(d.pointReward)),
    ).toBe(true)
    expect(secrets.some((d) => d.id === 'secret_account_menu')).toBe(true)
    expect(secrets.some((d) => d.id === 'secret_konami')).toBe(true)
    expect(secrets.some((d) => d.title === 'Ten Curtain Calls')).toBe(true)
    expect(secrets.every((d) => !d.description.includes('UTC'))).toBe(true)
    expect(secrets.every((d) => !d.description.includes('—'))).toBe(true)
    expect(secrets.every((d) => !d.title.includes('—'))).toBe(true)
  })
})

describe('advanceKonamiSequence', () => {
  it('completes after ↑↑↓↓←→←→BA', () => {
    let index = 0
    let completed = false
    for (const key of KONAMI_SEQUENCE) {
      const result = advanceKonamiSequence(index, key)
      index = result.index
      completed = result.completed
    }
    expect(completed).toBe(true)
    expect(index).toBe(0)
  })

  it('accepts uppercase B/A and restarts after a wrong key', () => {
    let index = 0
    index = advanceKonamiSequence(index, 'ArrowUp').index
    index = advanceKonamiSequence(index, 'ArrowUp').index
    index = advanceKonamiSequence(index, 'x').index
    expect(index).toBe(0)

    const keys = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'B',
      'A',
    ]
    let completed = false
    for (const key of keys) {
      const result = advanceKonamiSequence(index, key)
      index = result.index
      completed = result.completed
    }
    expect(completed).toBe(true)
  })
})

describe('advanceAccountMenuPressCount', () => {
  it('claims on the 10th press and stays claimable at higher counts', () => {
    let count = 0
    for (let i = 1; i <= 9; i += 1) {
      const step = advanceAccountMenuPressCount(count)
      count = step.count
      expect(step.shouldClaim).toBe(false)
      expect(count).toBe(i)
    }
    const claim = advanceAccountMenuPressCount(count)
    expect(claim.count).toBe(10)
    expect(claim.shouldClaim).toBe(true)
    expect(advanceAccountMenuPressCount(claim.count).shouldClaim).toBe(true)
  })
})

describe('secret event surface', () => {
  it('does not expose a client multi_unlock claim event', async () => {
    const mod = await import('./secretEvents')
    // Type-level: SecretEvent union must not include multi_unlock.
    // Runtime: reporting an unknown string is not part of the public API.
    expect('multi_unlock' in mod).toBe(false)
    expect(typeof mod.reportSecretEvent).toBe('function')
  })
})
