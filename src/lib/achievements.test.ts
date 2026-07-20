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

  it('awards early streak and full-clear day thresholds', () => {
    const prologue = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'any_streak_1')!
    const actually = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'any_streak_2')!
    expect(shouldAwardAchievement(prologue, { any_max_streak: 1 })).toBe(true)
    expect(shouldAwardAchievement(actually, { any_max_streak: 1 })).toBe(false)
    expect(shouldAwardAchievement(actually, { any_max_streak: 2 })).toBe(true)
    expect(actually.title).toBe('You came back!')
    expect(actually.description).not.toContain('came back')

    const clean = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'all_mode_streak_1')!
    const double = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'all_mode_streak_2')!
    expect(shouldAwardAchievement(clean, { all_max_streak: 1 })).toBe(true)
    expect(shouldAwardAchievement(double, { all_max_streak: 2 })).toBe(true)
  })

  it('awards visit / comeback milestones from visit metrics', () => {
    const footstep = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'visit_days_1')!
    expect(shouldAwardAchievement(footstep, { total_visit_days: 0 })).toBe(false)
    expect(shouldAwardAchievement(footstep, { total_visit_days: 1 })).toBe(true)

    const regression = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'visit_comeback_1')!
    expect(shouldAwardAchievement(regression, { visit_comebacks: 0 })).toBe(false)
    expect(shouldAwardAchievement(regression, { visit_comebacks: 1 })).toBe(true)

    const timeskip = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'visit_timeskip')!
    expect(shouldAwardAchievement(timeskip, { visit_long_comebacks: 0 })).toBe(false)
    expect(shouldAwardAchievement(timeskip, { visit_long_comebacks: 1 })).toBe(true)
  })

  it('extends progressive ladders through a two-year timeline', () => {
    expect(ACHIEVEMENT_DEFINITIONS.some((a) => a.id === 'completions_3000')).toBe(true)
    expect(ACHIEVEMENT_DEFINITIONS.some((a) => a.id === 'any_streak_730')).toBe(true)
    expect(ACHIEVEMENT_DEFINITIONS.some((a) => a.id === 'all_mode_streak_730')).toBe(true)
    expect(ACHIEVEMENT_DEFINITIONS.some((a) => a.id === 'all_mode_days_730')).toBe(true)

    const lifetime = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'completions_3000')!
    expect(lifetime.threshold).toBe(3000)
    expect(lifetime.pointReward).toBe(200)

    const yearTwo = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'any_streak_730')!
    expect(yearTwo.title).toBe('Second Season')
    expect(yearTwo.description.includes('—')).toBe(false)
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
    expect(awards[0]?.pointReward).toBe(25)
  })

  it('keeps every catalog reward in the balanced tier set', () => {
    expect(
      ACHIEVEMENT_DEFINITIONS.every((definition) =>
        [25, 50, 100, 200].includes(definition.pointReward),
      ),
    ).toBe(true)
  })

  it('includes Cascade for multi-unlock hush-hush', () => {
    const cascade = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === 'secret_cascade')!
    expect(cascade.title).toBe('Cascade')
    expect(cascade.category).toBe('secret')
    expect(cascade.pointReward).toBe(50)
    expect(cascade.description.includes('—')).toBe(false)
  })
})
