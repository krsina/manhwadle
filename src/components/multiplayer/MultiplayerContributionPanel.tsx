import type { SavedListSummary } from '../../lib/savedListsApi'
import type {
  MultiplayerListContributionSnapshot,
  MultiplayerMode,
  MultiplayerPoolSummary,
} from '../../lib/multiplayerTypes'
import { multiplayerModeLabel } from './multiplayerModeMeta'

interface MultiplayerContributionPanelProps {
  viewerUserId: string
  selectedModes: MultiplayerMode[]
  contributions: MultiplayerListContributionSnapshot[]
  summary: MultiplayerPoolSummary
  savedLists: SavedListSummary[]
  disabled?: boolean
  onContribute: (listId: string | null) => void
  onManageLists: () => void
}

export function MultiplayerContributionPanel({
  viewerUserId,
  selectedModes,
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
      <div className="saved-list-toolbar">
        <div>
          <h3 id="contribution-title">Collaborative pool</h3>
          <p className="versus-muted">
            {summary.contributorCount}/{summary.requiredContributorCount} players contributed
            {' · '}{summary.combinedEligibleCount} eligible unique titles
          </p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={onManageLists}>
          Manage my lists
        </button>
      </div>
      <label className="versus-field">
        <span className="versus-label">Your contribution</span>
        <select
          value={own?.sourceListId ?? ''}
          disabled={disabled}
          onChange={(event) => onContribute(event.target.value || null)}
        >
          <option value="">No list selected</option>
          {savedLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name} ({list.entryCount})
            </option>
          ))}
        </select>
      </label>
      {savedLists.length === 0 && (
        <p className="versus-hint">
          Create a private list with at least three titles before readying up.
        </p>
      )}
      <div className="contribution-roster">
        {contributions.map((contribution) => (
          <article className="contribution-row" key={contribution.userId}>
            <div>
              <strong>
                {contribution.userId === viewerUserId ? 'You' : contribution.username}
              </strong>
              <small>{contribution.listName} · {contribution.entryCount} saved</small>
            </div>
            <div className="contribution-counts">
              {selectedModes.map((mode) => (
                <span key={mode}>
                  {multiplayerModeLabel(mode)} {contribution.eligibleCounts[mode] ?? 0}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selectedModes.map((mode) => (
        <p className="versus-hint" key={mode}>
          {multiplayerModeLabel(mode)}: {summary.perModeEligibleCounts[mode] ?? 0}
          {' '}eligible unique titles (3 required).
        </p>
      ))}
    </section>
  )
}
