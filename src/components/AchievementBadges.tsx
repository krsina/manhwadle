import type { AchievementAward } from '../lib/achievements'

interface AchievementBadgesProps {
  awards: AchievementAward[]
  loading?: boolean
  error?: string | null
  emptyLabel?: string
}

export function AchievementBadges({
  awards,
  loading = false,
  error = null,
  emptyLabel = 'Finish daily modes to earn milestones. Progress is verified on the server.',
}: AchievementBadgesProps) {
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

  if (awards.length === 0) {
    return (
      <div className="achievement-badges is-empty">
        <p className="panel-muted">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <ul className="achievement-badges" aria-label="Milestones">
      {awards.map((award) => (
        <li key={award.id} className={`achievement-badge achievement-${award.category}`}>
          <span className="achievement-badge-title">{award.title}</span>
          <span className="achievement-badge-desc">{award.description}</span>
        </li>
      ))}
    </ul>
  )
}
