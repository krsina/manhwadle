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
  avatarId?: string | null
  isSelf?: boolean
}

interface MultiplayerRoundRevealProps {
  answerLabel: string | null
  /** Catalog entry for the answer; supplies cover art and metadata. */
  answer?: Manhwa | null
  attempts: RevealAttempt[]
  members: RevealMember[]
  catalog: Manhwa[]
}

function resolveGuesses(guessIds: number[] | null | undefined, catalog: Manhwa[]) {
  return (guessIds ?? []).map((id) => {
    const manhwa = findById(catalog, id)
    return {
      id,
      label: manhwa ? displayTitle(manhwa) : `Title ${id}`,
    }
  })
}

function isSolvedGuess(
  guesses: { id: number; label: string }[],
  answer: Manhwa | null,
  answerLabel: string | null,
): boolean {
  if (guesses.length === 0) return false
  const last = guesses[guesses.length - 1]!
  if (answer) return last.id === answer.id
  return Boolean(answerLabel && last.label === answerLabel)
}

export function MultiplayerRoundReveal({
  answerLabel,
  answer = null,
  attempts,
  members,
  catalog,
}: MultiplayerRoundRevealProps) {
  if (!answerLabel && attempts.every((attempt) => !attempt.guessIds)) return null

  const attemptByUser = new Map(attempts.map((attempt) => [attempt.userId, attempt]))
  const rows = members.map((member) => {
    const attempt = attemptByUser.get(member.userId)
    const guesses = resolveGuesses(attempt?.guessIds, catalog)
    return {
      member,
      guesses,
      solved: isSolvedGuess(guesses, answer, answerLabel),
    }
  })
  for (const attempt of attempts) {
    if (members.some((member) => member.userId === attempt.userId)) continue
    const guesses = resolveGuesses(attempt.guessIds, catalog)
    rows.push({
      member: { userId: attempt.userId, username: 'Player' },
      guesses,
      solved: isSolvedGuess(guesses, answer, answerLabel),
    })
  }

  const solvedCount = rows.filter((row) => row.solved).length
  const crowded = rows.length >= 5

  return (
    <section
      className={`multiplayer-reveal${crowded ? ' is-crowded' : ''}`}
      aria-label="Round answer and guesses"
    >
      {answerLabel && (
        <div className="multiplayer-reveal-answer">
          {answer && (
            <MediaImage
              className="multiplayer-reveal-cover"
              src={answer.coverImage ?? undefined}
              alt={`Cover of ${answerLabel}`}
              fallbackLabel="—"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="multiplayer-reveal-answer-copy">
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
                {[answer.startDate.year, answer.status, ...answer.genres.slice(0, 2)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="multiplayer-reveal-board">
        <p className="multiplayer-reveal-board-head">
          Guesses
          <span>
            {solvedCount}/{rows.length} solved
          </span>
        </p>
        <ul className="multiplayer-reveal-players">
          {rows.map(({ member, guesses, solved }) => (
            <li
              key={member.userId}
              className={`multiplayer-reveal-player${solved ? ' is-solved' : ''}${
                member.isSelf ? ' is-self' : ''
              }`}
            >
              <span className="multiplayer-reveal-name">
                {member.username}
                {member.isSelf ? <em>you</em> : null}
              </span>
              {guesses.length > 0 ? (
                <span className="multiplayer-reveal-guesses" aria-label={`${member.username} guesses`}>
                  {guesses.map((guess, index) => {
                    const isFinalCorrect = solved && index === guesses.length - 1
                    return (
                      <span key={`${guess.id}-${index}`}>
                        {index > 0 ? <span className="multiplayer-reveal-sep" aria-hidden="true">→</span> : null}
                        <span
                          className={`multiplayer-reveal-guess${
                            isFinalCorrect ? ' is-correct' : ''
                          }`}
                        >
                          {guess.label}
                        </span>
                      </span>
                    )
                  })}
                </span>
              ) : (
                <span className="multiplayer-reveal-empty">—</span>
              )}
              <span
                className={`multiplayer-reveal-mark${solved ? ' is-solved' : ''}`}
                aria-label={solved ? 'Solved' : guesses.length === 0 ? 'No guesses' : 'Not solved'}
              >
                {solved ? '✓' : guesses.length === 0 ? '·' : '×'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
