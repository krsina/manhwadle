import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACHIEVEMENT_DEFINITIONS } from './achievements'
import {
  CELEBRATION_SOUND_OPTIONS,
  CELEBRATION_SOUND_STORAGE_KEY,
  DEFAULT_CELEBRATION_SOUND,
  HUSH_SOUND_BY_ACHIEVEMENT,
  hushSoundForAchievement,
  loadCelebrationSoundId,
  saveCelebrationSoundId,
} from './celebrationSounds'

describe('celebrationSounds', () => {
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

  it('defaults to sparkle when nothing is stored', () => {
    expect(loadCelebrationSoundId()).toBe(DEFAULT_CELEBRATION_SOUND)
  })

  it('persists a valid sound id', () => {
    saveCelebrationSoundId('crystal')
    expect(loadCelebrationSoundId()).toBe('crystal')
    expect(localStorage.getItem(CELEBRATION_SOUND_STORAGE_KEY)).toBe('crystal')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem(CELEBRATION_SOUND_STORAGE_KEY, 'laser-pew')
    expect(loadCelebrationSoundId()).toBe(DEFAULT_CELEBRATION_SOUND)
  })

  it('exposes three distinct options', () => {
    expect(CELEBRATION_SOUND_OPTIONS.map((o) => o.id)).toEqual([
      'sparkle',
      'fanfare',
      'crystal',
    ])
  })

  it('maps every hush-hush achievement to a themed sound', () => {
    const secrets = ACHIEVEMENT_DEFINITIONS.filter((d) => d.category === 'secret')
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      expect(hushSoundForAchievement(secret.id), secret.id).toBeTruthy()
    }
    expect(Object.keys(HUSH_SOUND_BY_ACHIEVEMENT).sort()).toEqual(
      secrets.map((s) => s.id).sort(),
    )
  })

  it('gives konami an 8-bit cue', () => {
    expect(hushSoundForAchievement('secret_konami')).toBe('bit8')
  })

  it('gives cascade a stacked-drop cue', () => {
    expect(hushSoundForAchievement('secret_cascade')).toBe('cascade')
  })
})
