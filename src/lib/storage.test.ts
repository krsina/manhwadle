import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, loadDayState, saveDayState } from './storage'

describe('storage', () => {
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

  it('round-trips createInitialState via save/load', () => {
    const state = createInitialState('2026-07-15', 42)
    saveDayState(state, 'test:')
    expect(loadDayState('2026-07-15', 'test:')).toEqual(state)
  })

  it('returns null for missing or corrupt entries', () => {
    expect(loadDayState('2026-07-15', 'missing:')).toBeNull()
    store.set('bad:2026-07-15', '{')
    expect(loadDayState('2026-07-15', 'bad:')).toBeNull()
  })
})
