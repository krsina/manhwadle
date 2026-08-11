import type { Manhwa } from '../../lib/anilist-types'
import { displayTitle } from '../../lib/daily'
import { findById } from '../../lib/search'
import { MediaImage } from '../MediaImage'

interface RevealAttempt {
  userId: string
  guessIds: number[] | null
}

interface RevealMember {
  userId: string
  username: string
}

interface MultiplayerRoundRevealProps {
  answerLabel: string | null
  /** Catalog entry for the answer; supplies cover art and metadata. */
  answer?: Manhwa | null
  attempts: RevealAttempt[]
  members: RevealMember[]
  catalog: Manhwa[]
}

export function MultiplayerRoundReveal({
  answerLabel,
  answer = null,
  attempts,
  members,
  catalog,
}: MultiplayerRoundRevealProps) {
  if (!answerLabel && attempts.every((attempt) => !attempt.guessIds)) return null

  return (
    <section className="multiplayer-reveal" aria-label="Round answer and guesses">
      {answerLabel && (
        <div className="multiplayer-reveal-answer">
          {answer && (
            <MediaImage
              className="multiplayer-reveal-cover"
              src={answer.coverImage ?? undefined}
              alt={`Cover of ${answerLabel}`}
              fallbackLabel="No cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="multiplayer-reveal-answer-copy">
            <small>Answer</small>
            <strong>
              {answer?.siteUrl ? (
                <a
                  href={answer.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${answerLabel} on AniList`}
                >
                  {answerLabel}
                </a>
              ) : (
                answerLabel
              )}
            </strong>
            {answer && (
              <span className="multiplayer-reveal-meta">
                <span>{answer.startDate.year ?? '—'}</span>
                <span>{answer.status}</span>
                <span>{answer.genres.slice(0, 3).join(' · ')}</span>
              </span>
            )}
          </span>
        </div>
      )}
      <ul>
        {attempts.map((attempt) => {
          const username =
            members.find((member) => member.userId === attempt.userId)?.username ?? 'Player'
          const labels = (attempt.guessIds ?? []).map((id) => {
            const manhwa = findById(catalog, id)
            return manhwa ? displayTitle(manhwa) : `Title ${id}`
          })
          const solved =
            answerLabel != null && labels[labels.length - 1] === answerLabel
          return (
            <li key={attempt.userId}>
              <strong>{username}</strong>
              {labels.length > 0 ? (
                <span className="multiplayer-reveal-guesses">
                  {labels.map((label, index) => (
                    <span
                      key={`${label}-${index}`}
                      className={`multiplayer-reveal-guess${
                        solved && index === labels.length - 1 ? ' is-correct' : ''
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="multiplayer-reveal-empty">No guesses</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
