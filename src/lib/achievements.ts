/**
 * Server-derived achievement catalog (client display + parsing only).
 * Awards are never client-attested; hard_mode / hints are not competitive criteria.
 */

export const ACHIEVEMENT_VERSION = 1

export type AchievementCategory = 'completions' | 'streak' | 'all_mode'

export interface AchievementDefinition {
  id: string
  version: number
  title: string
  description: string
  category: AchievementCategory
  /** Metric key mirrored by the server awarder */
  metric:
    | 'total_completions'
    | 'any_max_streak'
    | 'any_current_streak'
    | 'all_max_streak'
    | 'all_complete_days'
  threshold: number
}

/** Small verified starter set — keep in sync with migration seed. */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'first_completion',
    version: ACHIEVEMENT_VERSION,
    title: 'First finish',
    description: 'Record your first verified daily completion.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 1,
  },
  {
    id: 'completions_10',
    version: ACHIEVEMENT_VERSION,
    title: 'Getting started',
    description: 'Finish 10 verified daily modes.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 10,
  },
  {
    id: 'completions_50',
    version: ACHIEVEMENT_VERSION,
    title: 'Dedicated reader',
    description: 'Finish 50 verified daily modes.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 50,
  },
  {
    id: 'any_streak_3',
    version: ACHIEVEMENT_VERSION,
    title: 'Three-day rhythm',
    description: 'Reach a 3-day any-mode streak.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 3,
  },
  {
    id: 'any_streak_7',
    version: ACHIEVEMENT_VERSION,
    title: 'Week of play',
    description: 'Reach a 7-day any-mode streak.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 7,
  },
  {
    id: 'all_mode_day',
    version: ACHIEVEMENT_VERSION,
    title: 'Full clear',
    description: 'Finish every required mode on a single UTC day.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 1,
  },
  {
    id: 'all_mode_streak_3',
    version: ACHIEVEMENT_VERSION,
    title: 'Triple full clear',
    description: 'Reach a 3-day all-mode streak.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 3,
  },
] as const

export interface AchievementAward {
  id: string
  version: number
  title: string
  description: string
  category: AchievementCategory
  awardedAt: string | null
}

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id)
}

/** Pure check used in tests — mirrors server threshold logic. */
export function shouldAwardAchievement(
  def: AchievementDefinition,
  metrics: Partial<Record<AchievementDefinition['metric'], number>>,
): boolean {
  const value = metrics[def.metric] ?? 0
  return value >= def.threshold
}

export function parseAchievementAwards(raw: unknown): AchievementAward[] {
  if (!raw || typeof raw !== 'object') return []
  const row = raw as Record<string, unknown>
  const list = Array.isArray(row.achievements)
    ? row.achievements
    : Array.isArray(raw)
      ? raw
      : null
  if (!list) return []
  const out: AchievementAward[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    if (typeof a.id !== 'string') continue
    const def = getAchievementDefinition(a.id)
    out.push({
      id: a.id,
      version: typeof a.version === 'number' ? a.version : (def?.version ?? 1),
      title: typeof a.title === 'string' ? a.title : (def?.title ?? a.id),
      description:
        typeof a.description === 'string'
          ? a.description
          : (def?.description ?? ''),
      category:
        a.category === 'completions' ||
        a.category === 'streak' ||
        a.category === 'all_mode'
          ? a.category
          : (def?.category ?? 'completions'),
      awardedAt: typeof a.awarded_at === 'string' ? a.awarded_at : null,
    })
  }
  return out
}
