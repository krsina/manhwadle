import type { Manhwa } from '../../lib/anilist-types'
import { displayTitle } from '../../lib/daily'
import type { MultiplayerMode } from '../../lib/multiplayerTypes'
import { findById } from '../../lib/search'
import { MediaImage } from '../MediaImage'
import { ModeGlyph } from '../ModeGlyph'
import {
  multiplayerModeGlyphKey,
  multiplayerModeLabel,
} from './multiplayerModeMeta'

export interface MultiplayerRecapEntry {
  roundIndex: number
  mode: MultiplayerMode
  modeRound: number
  answerId: number | null
  answerLabel: string | null
  /** Display names of everyone who solved the round ("You" for the viewer). */
  solvedBy: string[]
}

interface MultiplayerMatchRecapProps {
  entries: MultiplayerRecapEntry[]
  catalog: Manhwa[]
  roundsPerMode: number
}

/** Romaji/native form, when it differs from the title already shown. */
function secondaryTitle(manhwa: Manhwa, primary: string): string | null {
  for (const candidate of [manhwa.title.romaji, manhwa.title.native]) {
    const value = candidate?.trim()
    if (value && value.toLowerCase() !== primary.toLowerCase()) return value
  }
  return null
}

function solvedLabel(solvedBy: string[]): string {
  if (solvedBy.length === 0) return 'Nobody solved it'
  if (solvedBy.length === 1) return `Solved by ${solvedBy[0]}`
  return `Solved by ${solvedBy.slice(0, -1).join(', ')} and ${solvedBy[solvedBy.length - 1]}`
}

export function MultiplayerMatchRecap({
  entries,
  catalog,
  roundsPerMode,
}: MultiplayerMatchRecapProps) {
  if (entries.length === 0) return null
  const ordered = [...entries].sort((left, right) => left.roundIndex - right.roundIndex)

  return (
    <section className="versus-recap" aria-label="Every round of the match">
      <div className="versus-recap-head">
        <h3>Round by round</h3>
        <p className="versus-hint">Every title that came up, in play order.</p>
      </div>
      <ol className="versus-recap-grid">
        {ordered.map((entry) => {
          const manhwa = entry.answerId ? findById(catalog, entry.answerId) : null
          const title = manhwa
            ? displayTitle(manhwa)
            : entry.answerLabel ?? 'Answer unavailable'
          const secondary = manhwa ? secondaryTitle(manhwa, title) : null
          return (
            <li className="versus-recap-card" key={entry.roundIndex}>
              <div className="versus-recap-cover">
                <MediaImage
                  src={manhwa?.coverImage ?? undefined}
                  alt={`Cover of ${title}`}
                  fallbackLabel="No cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span className="versus-recap-round">R{entry.roundIndex + 1}</span>
              </div>
              <div className="versus-recap-body">
                <p className="versus-recap-mode">
                  <span className="versus-recap-mode-icon" aria-hidden="true">
                    <ModeGlyph presentationKey={multiplayerModeGlyphKey(entry.mode)} />
                  </span>
                  {multiplayerModeLabel(entry.mode)} · {entry.modeRound}/{roundsPerMode}
                </p>
                <h4 className="versus-recap-title">
                  {manhwa?.siteUrl ? (
                    <a
                      href={manhwa.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${title} on AniList`}
                    >
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                </h4>
                {secondary && <p className="versus-recap-alt">{secondary}</p>}
                {manhwa && (
                  <p className="versus-recap-meta">
                    <span>{manhwa.startDate.year ?? '—'}</span>
                    <span>{manhwa.status}</span>
                    <span>{manhwa.genres.slice(0, 3).join(' · ')}</span>
                  </p>
                )}
                <p
                  className={`versus-recap-solved${
                    entry.solvedBy.length === 0 ? ' is-unsolved' : ''
                  }`}
                >
                  {solvedLabel(entry.solvedBy)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
