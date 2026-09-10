import {
  AchievementIcon,
  LegacyAchievementIcon,
  achievementCategoryLabel,
} from '../components/AchievementIcon'
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementCategory,
} from '../lib/achievements'

const CATEGORY_ORDER: AchievementCategory[] = [
  'completions',
  'streak',
  'all_mode',
  'visit',
  'secret',
]

const REDESIGNED_IDS = new Set([
  'all_mode_streak_7',
  'all_mode_days_25',
  'all_mode_days_50',
  'all_mode_streak_60',
  'all_mode_days_100',
  'all_mode_streak_100',
  'all_mode_days_180',
  'all_mode_streak_180',
  'all_mode_streak_3',
  'secret_cascade',
])

export function AchievementIconComparisonPage() {
  return (
    <main className="achievement-icon-review page-shell">
      <header className="achievement-icon-review-header">
        <p className="eyebrow">Local design review</p>
        <h1>Ten icon fixes</h1>
        <p>
          Everything else keeps its original mark. These are the ten unclear icons, redrawn with
          literal symbols that match their achievement names.
        </p>
      </header>

      <div className="achievement-icon-review-legend" aria-label="Comparison columns">
        <span>Achievement</span>
        <span>Old</span>
        <span>New</span>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const definitions = ACHIEVEMENT_DEFINITIONS.filter(
          (definition) =>
            definition.category === category && REDESIGNED_IDS.has(definition.id),
        )
        if (definitions.length === 0) return null

        return (
          <section className={`achievement-icon-review-group achievement-${category}`} key={category}>
            <h2>{achievementCategoryLabel(category)}</h2>
            <div className="achievement-icon-review-grid">
              {definitions.map((definition) => (
                <article className="achievement-icon-review-row" key={definition.id}>
                  <div>
                    <strong>{definition.title}</strong>
                    <small>{definition.id}</small>
                  </div>
                  <span className="achievement-icon-review-seal is-old" aria-label="Old icon">
                    <LegacyAchievementIcon id={definition.id} category={definition.category} />
                  </span>
                  <span className="achievement-icon-review-seal is-new" aria-label="New icon">
                    <AchievementIcon id={definition.id} category={definition.category} />
                  </span>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </main>
  )
}
