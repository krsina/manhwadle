import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_DEFINITIONS,
  parseAchievementAwards,
  shouldAwardAchievement,
} from './achievements'

describe('shouldAwardAchievement', () => {
  it('awards on threshold without using hard_mode or hints', () => {
    const first = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'first_completion')!
    expect(shouldAwardAchievement(first, { total_completions: 0 })).toBe(false)
    expect(shouldAwardAchievement(first, { total_completions: 1 })).toBe(true)

    const streak = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'any_streak_7')!
    expect(shouldAwardAchievement(streak, { any_max_streak: 6 })).toBe(false)
    expect(shouldAwardAchievement(streak, { any_max_streak: 7 })).toBe(true)

    // Competitive awards ignore client-attested fields even if present on a metrics bag.
    const bag = {
      total_completions: 50,
      hard_mode: true,
      hints_used: 0,
    } as { total_completions: number }
    const fifty = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'completions_50')!
    expect(shouldAwardAchievement(fifty, bag)).toBe(true)
    expect(fifty.metric).not.toBe('hard_mode')
    expect(ACHIEVEMENT_DEFINITIONS.every((d) => !String(d.metric).includes('hint'))).toBe(
      true,
    )
  })
})

describe('parseAchievementAwards', () => {
  it('maps server payloads', () => {
    const awards = parseAchievementAwards({
      achievements: [
        {
          id: 'first_completion',
          version: 1,
          title: 'First finish',
          description: '…',
          category: 'completions',
          awarded_at: '2026-07-17T00:00:00Z',
        },
      ],
    })
    expect(awards).toHaveLength(1)
    expect(awards[0]?.id).toBe('first_completion')
    expect(awards[0]?.awardedAt).toBe('2026-07-17T00:00:00Z')
  })
})
