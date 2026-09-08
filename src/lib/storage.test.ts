import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialState,
  loadDayState,
  reconcileDayStateWithAttempt,
  saveDayState,
} from './storage'

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

  it('reconciles a stale playing device with a surrendered server attempt', () => {
    const local = createInitialState('2026-09-08', 12)
    const reconciled = reconcileDayStateWithAttempt(
      local,
      {
        dateKey: '2026-09-08',
        mode: 'summary',
        taste: 'action',
        hardMode: false,
        hintsUsed: 0,
        guessIds: [],
        guessCount: 0,
        maxGuesses: 6,
        status: 'surrendered',
        characterId: null,
        meta: null,
        answerId: 99,
        finalizedAt: '2026-09-08T03:11:27Z',
      },
      99,
    )

    expect(reconciled).toMatchObject({
      answerId: 99,
      guessIds: [],
      status: 'lost',
      hardMode: false,
      hintsUsed: 0,
    })
  })

  it('uses server guesses while retaining matching local labels', () => {
    const reconciled = reconcileDayStateWithAttempt(
      {
        dateKey: '2026-09-08',
        answerId: 0,
        guessIds: [10],
        guessLabels: ['Selected alias'],
        status: 'playing',
      },
      {
        dateKey: '2026-09-08',
        mode: 'cover',
        taste: 'action',
        hardMode: true,
        hintsUsed: 1,
        guessIds: [10, 20],
        guessCount: 2,
        maxGuesses: 6,
        status: 'active',
        characterId: null,
        meta: null,
        answerId: null,
        finalizedAt: null,
      },
      0,
    )

    expect(reconciled).toMatchObject({
      guessIds: [10, 20],
      guessLabels: ['Selected alias', ''],
      status: 'playing',
      hardMode: true,
      hintsUsed: 1,
    })
  })
})
