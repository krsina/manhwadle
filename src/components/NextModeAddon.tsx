import { Link } from 'react-router-dom'
import { listModes } from '../modes'
import { playPath, VERSUS_PATH } from '../lib/routes'
import { ModeGlyph } from './ModeGlyph'

interface NextModeAddonProps {
  completedIds: readonly string[]
}

/** Result-modal chips + Play button for the next unfinished daily. */
export function NextModeAddon({ completedIds }: NextModeAddonProps) {
  const modes = listModes()
  const completed = new Set(completedIds)
  const remaining = modes.filter((mode) => !completed.has(mode.id))
  const recommended = remaining[0] ?? null
  const doneToday = remaining.length === 0
  const progressLabel = `${completed.size} of ${modes.length} today`

  const modeRow = (
    <div className="nmp-combo-modes">
      <p className="nmp-kicker">{progressLabel}</p>
      <div className="nmp-chip-row" role="group" aria-label="Today’s modes">
        {modes.map((mode) => {
          const finished = completed.has(mode.id)
          const next = recommended?.id === mode.id
          const className = `nmp-chip is-icon${finished ? ' is-done' : ''}${next ? ' is-next' : ''}`
          const label = finished
            ? `${mode.name}, completed`
            : next
              ? `${mode.name}, up next`
              : `Play ${mode.name}`
          const body = <ModeGlyph presentationKey={mode.presentationKey} />
          if (finished) {
            return (
              <span key={mode.id} className={className} title={label}>
                {body}
                <span className="visually-hidden">{label}</span>
              </span>
            )
          }
          return (
            <Link
              key={mode.id}
              className={className}
              to={playPath(mode.id)}
              aria-label={label}
              title={label}
              aria-current={next ? 'page' : undefined}
            >
              {body}
            </Link>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="nmp-addon nmp-combo">
      {doneToday || !recommended ? (
        <div className="nmp-strip nmp-strip-done">
          <span className="nmp-strip-copy">
            <span>Daily set complete</span>
            <strong>Versus</strong>
          </span>
          <Link className="btn btn-primary" to={VERSUS_PATH}>
            Play Versus
          </Link>
        </div>
      ) : (
        <div className="nmp-strip">
          <span className="nmp-strip-icon">
            <ModeGlyph presentationKey={recommended.presentationKey} />
          </span>
          <span className="nmp-strip-copy">
            <span>Up next</span>
            <strong>{recommended.name}</strong>
          </span>
          <Link className="btn btn-primary" to={playPath(recommended.id)}>
            Play {recommended.name}
          </Link>
        </div>
      )}
      {modeRow}
    </div>
  )
}
