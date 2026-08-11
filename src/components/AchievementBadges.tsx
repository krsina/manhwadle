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
  /** Cap how many earned tiles render (homepage preview). Ignored for catalog. */
  limit?: number
  /** Show the full catalog with locked tiles for unearned milestones. */
  catalog?: boolean
  /** Group catalog tiles by category with section headings. */
  groupByCategory?: boolean
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'completions',
  'streak',
  'all_mode',
  'secret',
]

function categorySectionTitle(category: AchievementCategory): string {
  switch (category) {
    case 'streak':
      return 'Streaks'
    case 'all_mode':
      return 'Full clears'
    case 'secret':
      return 'Hush-Hush'
    case 'visit':
      return 'Hush-Hush'
    default:
      return 'Completions'
  }
}

/** Catalog tile: display copy/points from definitions; keep server awardedAt when earned. */
function catalogAward(
  def: AchievementDefinition,
  earned: AchievementAward | undefined,
): AchievementAward {
  return {
    ...definitionToAward(def),
    awardedAt: earned?.awardedAt ?? null,
  }
}

export function AchievementBadges({
  awards,
  loading = false,
  error = null,
  emptyLabel = 'Finish daily modes to earn milestones. Progress is verified on the server.',
  limit,
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
      const preview =
        typeof limit === 'number' && limit >= 0 && awards.length > limit
          ? awards.slice(-limit)
          : awards
      return preview.map((award) => ({ award, earned: true }))
    }
    return ACHIEVEMENT_DEFINITIONS.map((def) => {
      const earned = earnedById.get(def.id)
      return {
        award: catalogAward(def, earned),
        earned: Boolean(earned),
      }
    })
  }, [awards, catalog, earnedById, limit])

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
                    award: catalogAward(def, earned),
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
    case 'secret':
      return 'Hidden feats. No spoilers.'
    case 'visit':
      return 'Hidden feats. No spoilers.'
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
      {tiles.map(({ award, earned }) => {
        const hushLocked = award.category === 'secret' && !earned
        const title = hushLocked ? '???' : award.title
        const categoryLabel = achievementCategoryLabel(award.category)
        const ariaLabel = hushLocked
          ? `Hidden feat. ${categoryLabel}. Locked. No spoilers.`
          : `${award.title}. ${categoryLabel}. ${award.pointReward} shop points. ${earned ? 'Earned' : 'Locked'}. View details.`

        return (
          <li key={award.id}>
            <button
              type="button"
              className={`achievement-badge achievement-${award.category}${earned ? '' : ' is-locked'}${hushLocked ? ' is-hush-hidden' : ''}`}
              onClick={() => onSelect(award)}
              aria-label={ariaLabel}
            >
              <span className="achievement-badge-mark" aria-hidden="true">
                <AchievementIcon
                  id={hushLocked ? undefined : award.id}
                  category={award.category}
                />
              </span>
              <span className="achievement-badge-title">{title}</span>
              <span className="achievement-badge-reward" aria-hidden="true">
                ◆ {hushLocked ? '???' : award.pointReward}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
