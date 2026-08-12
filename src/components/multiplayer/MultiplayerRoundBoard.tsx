import { CharacterClue } from '../CharacterClue'
import { CoverClue } from '../CoverClue'
import { FeedbackGrid } from '../FeedbackGrid'
import { GuessInput } from '../GuessInput'
import { KnownInfoPanel } from '../KnownInfoPanel'
import { SongClue } from '../SongClue'
import { SummaryClue } from '../SummaryClue'
import type { GuessFeedback, Manhwa } from '../../lib/anilist-types'
import { buildKnownInfo } from '../../lib/knowledge'
import { clipSecondsForGuesses, type ManhwaSong } from '../../lib/songs'
import type { StatsModeId } from '../../lib/stats'

export interface MultiplayerBoardRound {
  id: string
  mode: StatsModeId
  clue: Record<string, unknown>
}

interface MultiplayerRoundBoardProps {
  round: MultiplayerBoardRound
  guessPool: Manhwa[]
  guessIds: number[]
  feedback: GuessFeedback[]
  status: 'active' | 'won' | 'lost' | 'surrendered' | 'timeout' | 'withdrawn'
  pending: boolean
  answerLabel?: string | null
  /** When false, caller renders KnownInfo elsewhere (e.g. Versus live rail). */
  showKnownInfo?: boolean
  onGuess: (manhwa: Manhwa, matchedLabel?: string) => void
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function MultiplayerModeClue({
  round,
  failedGuesses,
  finished,
}: {
  round: MultiplayerBoardRound
  failedGuesses: number
  finished: boolean
}) {
  const clue = round.clue
  if (round.mode === 'summary') {
    const allBlurbs = Array.isArray(clue.blurbs)
      ? clue.blurbs.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : []
    const unlocked = Math.max(1, Math.min(allBlurbs.length, failedGuesses + 1))
    return (
      <SummaryClue
        blurbs={allBlurbs.slice(0, unlocked)}
        totalBlurbs={allBlurbs.length}
        finished={finished}
      />
    )
  }

  if (round.mode === 'cover') {
    return (
      <CoverClue
        imageUrl={stringValue(clue.image_url)}
        manhwaId={0}
        dateKey={round.id}
        seedPrefix="multiplayer:cover"
        failedGuesses={failedGuesses}
        finished={finished}
        maxGuesses={6}
        focusX={numberValue(clue.focus_x, 50)}
        focusY={numberValue(clue.focus_y, 35)}
      />
    )
  }

  if (round.mode === 'character') {
    return (
      <CharacterClue
        crop={{
          manhwaId: 0,
          imageUrl: stringValue(clue.image_url),
          focusX: numberValue(clue.focus_x, 50),
          focusY: numberValue(clue.focus_y, 28),
        }}
        failedGuesses={failedGuesses}
        finished={finished}
        maxGuesses={6}
        progressiveZoom
      />
    )
  }

  const song: ManhwaSong = {
    id: stringValue(clue.id) || `multiplayer-${round.id}`,
    manhwaId: 0,
    songTitle: '',
    kind: clue.kind === 'bgm' ? 'bgm' : 'vocal',
    source:
      clue.source === 'anime' ||
      clue.source === 'drama' ||
      clue.source === 'film'
        ? clue.source
        : 'webtoon_ost',
    youtubeId: stringValue(clue.youtube_id),
    startSec: numberValue(clue.start_sec, 0),
  }
  return (
    <SongClue
      song={song}
      clipSeconds={clipSecondsForGuesses(failedGuesses, 6)}
      failedGuesses={failedGuesses}
      finished={finished}
      maxGuesses={6}
      showVideo={finished || failedGuesses >= 5}
    />
  )
}

export function MultiplayerRoundBoard({
  round,
  guessPool,
  guessIds,
  feedback,
  status,
  pending,
  answerLabel,
  showKnownInfo = true,
  onGuess,
}: MultiplayerRoundBoardProps) {
  const finished = status !== 'active'
  const failedGuesses = status === 'won' ? Math.max(0, guessIds.length - 1) : guessIds.length
  const excludedIds = new Set(guessIds)
  const knownInfo = buildKnownInfo(feedback)

  return (
    <div className={`multiplayer-board${showKnownInfo ? '' : ' is-clue-focus'}`}>
      <div className="multiplayer-board-main">
        <MultiplayerModeClue
          round={round}
          failedGuesses={failedGuesses}
          finished={finished}
        />
        <GuessInput
          pool={guessPool}
          disabled={finished || pending}
          excludedIds={excludedIds}
          onGuess={onGuess}
          disabledPlaceholder={
            pending
              ? 'Submitting guess…'
              : finished
                ? answerLabel || 'Waiting for the round to finish…'
                : undefined
          }
        />
        <FeedbackGrid rows={feedback} />
      </div>
      {showKnownInfo && (
        <aside className="side-rail" aria-label="Known information">
          <KnownInfoPanel info={knownInfo} hasGuesses={feedback.length > 0} />
        </aside>
      )}
    </div>
  )
}
