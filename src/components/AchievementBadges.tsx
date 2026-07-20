import { useMemo, useState } from 'react'
import {
  ACHIEVEMENT_DEFINITIONS,
  definitionToAward,
  type AchievementAward,
  type AchievementCategory,
  type AchievementDefinition,
} from '../lib/achievements'
import { AchievementIcon, achievementCategoryLabel } from './AchievementIcon'
import { AchievementUnlockModal } from './AchievementUnlockModal'

interface AchievementBadgesProps {
  awards: AchievementAward[]
  loading?: boolean
  error?: string | null
  emptyLabel?: string
  /** Show the full catalog with locked tiles for unearned milestones. */
  catalog?: boolean
  /** Group catalog tiles by category with section headings. */
  groupByCategory?: boolean
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'completions',
  'streak',
  'all_mode',
  'visit',
  'secret',
]

function categorySectionTitle(category: AchievementCategory): string {
  switch (category) {
    case 'streak':
      return 'Streaks'
    case 'all_mode':
      return 'Full clears'
    case 'visit':
      return 'Return arcs'
    case 'secret':
      return 'Hush-Hush'
    default:
      return 'Completions'
  }
}

export function AchievementBadges({
  awards,
  loading = false,
  error = null,
  emptyLabel = 'Finish daily modes to earn milestones. Progress is verified on the server.',
  catalog = false,
  groupByCategory = false,
}: AchievementBadgesProps) {
  const [selected, setSelected] = useState<AchievementAward | null>(null)

  const earnedById = useMemo(() => {
    const map = new Map<string, AchievementAward>()
    for (const award of awards) map.set(award.id, award)
    return map
  }, [awards])

  const tiles = useMemo(() => {
    if (!catalog) {
      return awards.map((award) => ({ award, earned: true }))
    }
    return ACHIEVEMENT_DEFINITIONS.map((def) => {
      const earned = earnedById.get(def.id)
      return {
        award: earned ?? definitionToAward(def),
        earned: Boolean(earned),
      }
    })
  }, [awards, catalog, earnedById])

  if (loading) {
    return (
      <div className="achievement-badges is-loading" aria-busy="true">
        <p className="panel-muted">Loading milestones…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="achievement-badges is-error" role="alert">
        <p className="panel-muted">{error}</p>
      </div>
    )
  }

  if (!catalog && awards.length === 0) {
    return (
      <div className="achievement-badges is-empty">
        <p className="panel-muted">{emptyLabel}</p>
      </div>
    )
  }

  if (catalog && groupByCategory) {
    return (
      <>
        {CATEGORY_ORDER.map((category) => {
          const defs = ACHIEVEMENT_DEFINITIONS.filter((d) => d.category === category)
          if (defs.length === 0) return null
          return (
            <section
              key={category}
              className="milestone-ladder"
              aria-labelledby={`milestone-ladder-${category}`}
            >
              <h2 id={`milestone-ladder-${category}`} className="milestone-ladder-title">
                {categorySectionTitle(category)}
              </h2>
              <p className="milestone-ladder-blurb">
                {categoryBlurb(category, defs)}
              </p>
              <TrophyGrid
                tiles={defs.map((def) => {
                  const earned = earnedById.get(def.id)
                  return {
                    award: earned ?? definitionToAward(def),
                    earned: Boolean(earned),
                  }
                })}
                onSelect={setSelected}
              />
            </section>
          )
        })}
        <AchievementUnlockModal
          award={selected}
          mode="detail"
          onClose={() => setSelected(null)}
        />
      </>
    )
  }

  return (
    <>
      <TrophyGrid tiles={tiles} onSelect={setSelected} />
      <AchievementUnlockModal
        award={selected}
        mode="detail"
        onClose={() => setSelected(null)}
      />
    </>
  )
}

function categoryBlurb(category: AchievementCategory, defs: readonly AchievementDefinition[]) {
  const first = defs[0]?.threshold
  const last = defs[defs.length - 1]?.threshold
  switch (category) {
    case 'streak':
      return `Keep any mode alive from ${first} to ${last} days.`
    case 'all_mode':
      return 'Clear every mode in a day, then chain those sweeps.'
    case 'visit':
      return 'Show up each day, keep visit streaks, and come back after hiatus.'
    case 'secret':
      return 'Hidden feats. Descriptions are hints. No spoilers.'
    default:
      return `Stack verified finishes from ${first} to ${last}.`
  }
}

function TrophyGrid({
  tiles,
  onSelect,
}: {
  tiles: { award: AchievementAward; earned: boolean }[]
  onSelect: (award: AchievementAward) => void
}) {
  return (
    <ul className="achievement-badges" aria-label="Milestones">
      {tiles.map(({ award, earned }) => (
        <li key={award.id}>
          <button
            type="button"
            className={`achievement-badge achievement-${award.category}${earned ? '' : ' is-locked'}`}
            onClick={() => onSelect(award)}
            aria-label={`${award.title}. ${achievementCategoryLabel(award.category)}. ${award.pointReward} shop points. ${earned ? 'Earned' : 'Locked'}. View details.`}
          >
            <span className="achievement-badge-mark" aria-hidden="true">
              <AchievementIcon id={award.id} category={award.category} />
            </span>
            <span className="achievement-badge-title">{award.title}</span>
            <span className="achievement-badge-reward" aria-hidden="true">
              ◆ {award.pointReward}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
