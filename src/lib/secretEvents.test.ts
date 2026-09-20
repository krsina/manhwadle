import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACHIEVEMENT_DEFINITIONS } from './achievements'
import {
  advanceAccountMenuPressCount,
  advanceKonamiSequence,
  BACKGROUND_CULTIVATION_MS,
  consumePendingReauth,
  isBackgroundCultivationDue,
  KONAMI_SEQUENCE,
  markPendingReauth,
  pendingReauthMatchesUser,
} from './secretEvents'

describe('secret achievements catalog', () => {
  it('includes hush-hush secrets with balanced point tiers', () => {
    const secrets = ACHIEVEMENT_DEFINITIONS.filter((d) => d.category === 'secret')
    expect(secrets.length).toBe(33)
    expect(secrets.some((d) => d.id === 'secret_early_bird')).toBe(true)
    expect(secrets.some((d) => d.id === 'visit_comeback_1')).toBe(true)
    expect(secrets.some((d) => d.id === 'visit_timeskip')).toBe(true)

    const flagSecrets = secrets.filter((d) => d.metric === 'secret_flag')
    expect(flagSecrets.length).toBe(28)
    expect(flagSecrets.every((d) => [50, 100].includes(d.pointReward))).toBe(true)
    expect(flagSecrets.filter((d) => d.pointReward === 50)).toHaveLength(14)
    expect(flagSecrets.filter((d) => d.pointReward === 100)).toHaveLength(14)

    const hiatusSecrets = secrets.filter((d) => d.metric !== 'secret_flag')
    expect(hiatusSecrets).toHaveLength(5)
    expect(hiatusSecrets.every((d) => [50, 100, 200].includes(d.pointReward))).toBe(true)

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

describe('pendingReauthMatchesUser', () => {
  it('requires the same user who signed out', () => {
    expect(pendingReauthMatchesUser('user-a', 'user-a')).toBe(true)
    expect(pendingReauthMatchesUser('user-a', 'user-b')).toBe(false)
    expect(pendingReauthMatchesUser(null, 'user-a')).toBe(false)
    expect(pendingReauthMatchesUser('1', 'user-a')).toBe(false)
  })
})

describe('consumePendingReauth', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
      clear: () => memory.clear(),
    })
  })

  it('does not award Return of the King to a different signup', () => {
    markPendingReauth('user-a')
    expect(consumePendingReauth('user-b')).toBe(false)
    expect(consumePendingReauth('user-a')).toBe(true)
    expect(consumePendingReauth('user-a')).toBe(false)
  })

  it('discards the legacy browser-wide flag without awarding', () => {
    memory.set('manhwadle:secret:pending-reauth', '1')
    expect(consumePendingReauth('user-a')).toBe(false)
    expect(memory.get('manhwadle:secret:pending-reauth')).toBeUndefined()
  })
})

describe('background cultivation idle', () => {
  it('requires two idle hours on the current page', () => {
    const now = Date.parse('2026-09-20T00:00:00.000Z')
    expect(BACKGROUND_CULTIVATION_MS).toBe(2 * 60 * 60 * 1000)
    expect(isBackgroundCultivationDue(now, now)).toBe(false)
    expect(isBackgroundCultivationDue(now, now + 60_000)).toBe(false)
    expect(isBackgroundCultivationDue(now, now + 60 * 60 * 1000)).toBe(false)
    expect(isBackgroundCultivationDue(now, now + BACKGROUND_CULTIVATION_MS)).toBe(true)
  })
})
