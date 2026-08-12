import type { SavedListSummary } from '../../lib/savedListsApi'
import type {
  MultiplayerListContributionSnapshot,
  MultiplayerPoolSummary,
} from '../../lib/multiplayerTypes'

interface MultiplayerContributionPanelProps {
  viewerUserId: string
  contributions: MultiplayerListContributionSnapshot[]
  summary: MultiplayerPoolSummary
  savedLists: SavedListSummary[]
  disabled?: boolean
  onContribute: (listId: string | null) => void
  onManageLists: () => void
}

function contributorSummary(summary: MultiplayerPoolSummary): string {
  if (summary.contributorCount === 0) {
    return 'No lists shared yet. One list is enough to start the match.'
  }
  const players = summary.activeMemberCount || summary.contributorCount
  return `${summary.contributorCount} of ${players} player${
    players === 1 ? '' : 's'
  } shared a list.`
}

function uniqueTitleLabel(count: number): string {
  return `${count} unique title${count === 1 ? '' : 's'}`
}

export function MultiplayerContributionPanel({
  viewerUserId,
  contributions,
  summary,
  savedLists,
  disabled = false,
  onContribute,
  onManageLists,
}: MultiplayerContributionPanelProps) {
  const own = contributions.find(
    (contribution) => contribution.userId === viewerUserId,
  )
  return (
    <section className="versus-contributions" aria-labelledby="contribution-title">
      <div className="versus-contributions-head">
        <div>
          <h3 id="contribution-title">Shared pool</h3>
          <p className="versus-muted">
            Rounds are drawn from every list shared in this room.
          </p>
        </div>
        <span className="versus-chip">
          {uniqueTitleLabel(summary.uniqueTitleCount)}
        </span>
      </div>
      <p className="versus-contribution-status" role="status">
        {contributorSummary(summary)}
      </p>
      <div className="versus-contribution-picker">
        <label className="versus-field">
          <span className="versus-label">
            Your list <span className="versus-label-note">Optional</span>
          </span>
          <select
            value={own?.sourceListId ?? ''}
            disabled={disabled || savedLists.length === 0}
            onChange={(event) => onContribute(event.target.value || null)}
          >
            <option value="">Not sharing a list</option>
            {savedLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="button" onClick={onManageLists}>
          {savedLists.length === 0 ? 'Create a list' : 'Manage lists'}
        </button>
      </div>
      {savedLists.length === 0 && (
        <p className="versus-hint">
          You have no saved lists yet. Build one with at least three titles to add
          it to the pool.
        </p>
      )}
      {contributions.length > 0 && (
        <div className="contribution-roster">
          {contributions.map((contribution) => (
            <article className="contribution-row" key={contribution.userId}>
              <div>
                <strong>
                  {contribution.userId === viewerUserId ? 'You' : contribution.username}
                </strong>
                <small>{contribution.listName}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
