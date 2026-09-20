import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimFreshAchievementIds,
  clearSeenAchievements,
  consumeNewAchievementIds,
  hasHydratedAchievements,
  bindAchievementUnlockUser,
  partitionHydrationUnlocks,
  resetAchievementUnlockSession,
  seedSeenAchievements,
  unseeAchievementIds,
} from './achievementUnlocks'

describe('consumeNewAchievementIds', () => {
  beforeEach(() => {
    resetAchievementUnlockSession()
  })

  it('seeds existing awards without toasting on first visit', () => {
    expect(consumeNewAchievementIds(['first_completion', 'any_streak_3'])).toEqual([])
    expect(hasHydratedAchievements()).toBe(true)
    expect(consumeNewAchievementIds(['first_completion', 'any_streak_3'])).toEqual([])
  })

  it('returns only newly earned ids after seed', () => {
    consumeNewAchievementIds(['first_completion'])
    expect(consumeNewAchievementIds(['first_completion', 'completions_10'])).toEqual([
      'completions_10',
    ])
  })

  it('toasts the first earned award after an empty initial sync', () => {
    seedSeenAchievements([])
    expect(claimFreshAchievementIds(['secret_konami'])).toEqual(['secret_konami'])
    expect(claimFreshAchievementIds(['secret_konami'])).toEqual([])
  })
})

describe('claimFreshAchievementIds', () => {
  beforeEach(() => {
    resetAchievementUnlockSession()
  })

  it('toasts immediately even before server hydration', () => {
    expect(claimFreshAchievementIds(['secret_konami'])).toEqual(['secret_konami'])
    expect(hasHydratedAchievements()).toBe(true)
    seedSeenAchievements(['secret_konami', 'first_completion'])
    expect(consumeNewAchievementIds(['secret_konami', 'first_completion'])).toEqual([])
  })
})

describe('clearSeenAchievements', () => {
  beforeEach(() => {
    resetAchievementUnlockSession()
  })

  it('allows the next sync to toast again after a DEV reset', () => {
    seedSeenAchievements(['secret_konami'])
    clearSeenAchievements()
    expect(consumeNewAchievementIds(['secret_konami'])).toEqual(['secret_konami'])
  })
})

describe('unseeAchievementIds', () => {
  beforeEach(() => {
    resetAchievementUnlockSession()
  })

  it('lets a real re-grant toast after stale local seen', () => {
    seedSeenAchievements(['secret_konami'])
    expect(claimFreshAchievementIds(['secret_konami'])).toEqual([])
    unseeAchievementIds(['secret_konami'])
    expect(claimFreshAchievementIds(['secret_konami'])).toEqual(['secret_konami'])
  })
})

describe('partitionHydrationUnlocks', () => {
  it('toasts signup-time awards and seeds older ones', () => {
    const now = Date.parse('2026-09-20T00:00:00.000Z')
    const { seedIds, toastIds } = partitionHydrationUnlocks(
      [
        { id: 'secret_early_bird', awardedAt: '2026-09-19T23:30:00.000Z' },
        { id: 'first_completion', awardedAt: '2026-08-01T00:00:00.000Z' },
      ],
      now,
    )
    expect(toastIds).toEqual(['secret_early_bird'])
    expect(seedIds).toEqual(['first_completion'])
  })

  it('seeds awards with missing or future timestamps', () => {
    const now = Date.parse('2026-09-20T00:00:00.000Z')
    const { seedIds, toastIds } = partitionHydrationUnlocks(
      [
        { id: 'secret_early_bird', awardedAt: 'not-a-date' },
        { id: 'secret_lurker', awardedAt: '2026-09-21T00:00:00.000Z' },
      ],
      now,
    )
    expect(toastIds).toEqual([])
    expect(seedIds).toEqual(['secret_early_bird', 'secret_lurker'])
  })
})

describe('bindAchievementUnlockUser', () => {
  beforeEach(() => {
    resetAchievementUnlockSession()
  })

  it('does not inherit seen ids from another account', () => {
    bindAchievementUnlockUser('user-a')
    seedSeenAchievements(['secret_early_bird'])
    bindAchievementUnlockUser('user-b')
    expect(hasHydratedAchievements()).toBe(false)
    expect(claimFreshAchievementIds(['secret_early_bird'])).toEqual(['secret_early_bird'])
  })
})
