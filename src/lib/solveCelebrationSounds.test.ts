import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SOLVE_SOUND_PAIR,
  SOLVE_SOUND_PAIRS,
  SOLVE_SOUND_PAIR_STORAGE_KEY,
  loadSolveSoundPairId,
  playSolveCelebrationSound,
  saveSolveSoundPairId,
} from './solveCelebrationSounds'

describe('solveCelebrationSounds', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to system-alert when nothing is stored', () => {
    expect(loadSolveSoundPairId()).toBe(DEFAULT_SOLVE_SOUND_PAIR)
    expect(DEFAULT_SOLVE_SOUND_PAIR).toBe('system-alert')
  })

  it('persists a valid pair id', () => {
    saveSolveSoundPairId('shadow-bolt')
    expect(loadSolveSoundPairId()).toBe('shadow-bolt')
    expect(localStorage.getItem(SOLVE_SOUND_PAIR_STORAGE_KEY)).toBe('shadow-bolt')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem(SOLVE_SOUND_PAIR_STORAGE_KEY, 'laser-pew')
    expect(loadSolveSoundPairId()).toBe(DEFAULT_SOLVE_SOUND_PAIR)
  })

  it('exposes ten distinct pairs', () => {
    expect(SOLVE_SOUND_PAIRS.map((p) => p.id)).toEqual([
      'volt-arc',
      'shadow-bolt',
      'system-alert',
      'blade-spark',
      'thunder-gate',
      'rift-tear',
      'blood-pulse',
      'ki-flare',
      'neon-surge',
      'frost-arc',
    ])
  })

  it('plays every pair without throwing outside a browser', async () => {
    for (const pair of SOLVE_SOUND_PAIRS) {
      await expect(playSolveCelebrationSound('first-try', pair.id)).resolves.toBeUndefined()
      await expect(playSolveCelebrationSound('double-solve', pair.id)).resolves.toBeUndefined()
    }
  })
})
