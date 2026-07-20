import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimFreshAchievementIds,
  clearSeenAchievements,
  consumeNewAchievementIds,
  hasHydratedAchievements,
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
