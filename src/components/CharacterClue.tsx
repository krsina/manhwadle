import type { CharacterCropEntry } from '../lib/crops'
import { clampFocus, cropZoomScale } from '../lib/crops'
import { MediaImage } from './MediaImage'
import { RevealMoreButton } from './RevealMoreButton'

interface CharacterClueProps {
  crop: CharacterCropEntry
  failedGuesses: number
  finished: boolean
  maxGuesses: number
  canRevealMore?: boolean
  onRevealMore?: () => void
  /** Optional grayscale filter (hard-mode helper) */
  grayscale?: boolean
  /**
   * Progressive zoom-out ladder. Hard mode keeps it; normal mode shows the
   * full portrait from the start.
   */
  progressiveZoom?: boolean
  /**
   * Shown under the clue after the round ends. On a win, wait until the bonus
   * name guess is answered so the clue board does not spoil it.
   */
  revealName?: string | null
}

/** Character portrait clue in a fixed portrait frame. */
export function CharacterClue({
  crop,
  failedGuesses,
  finished,
  maxGuesses,
  canRevealMore = false,
  onRevealMore,
  grayscale = false,
  progressiveZoom = true,
  revealName = null,
}: CharacterClueProps) {
  const scale = progressiveZoom
    ? cropZoomScale(failedGuesses, { finished })
    : 1
  const focusX = clampFocus(crop.focusX)
  const focusY = clampFocus(crop.focusY, 28)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)
  const shownName = finished ? revealName?.trim() || null : null

  return (
    <section className="crop-clue" aria-label="Today's character clue">
      <div className="crop-clue-column">
        <div className="crop-clue-header">
          <p className="clue-label">
            {finished
              ? 'Full reveal'
              : progressiveZoom
                ? `Character clue ${step}/${maxGuesses}`
                : 'Character clue'}
          </p>
          {!finished && progressiveZoom && (
            <div className="clue-hint-row">
              <p className="clue-hint">Wrong guesses zoom out</p>
              {onRevealMore && (
                <RevealMoreButton
                  onClick={onRevealMore}
                  disabled={!canRevealMore}
                />
              )}
            </div>
          )}
        </div>
        <div className={`crop-reveal-stage${shownName ? ' has-name' : ''}`}>
          <div className="crop-frame crop-frame-portrait">
            <div
              className="crop-zoom"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: `${focusX}% ${focusY}%`,
              }}
            >
              <MediaImage
                className={`crop-image${grayscale ? ' is-grayscale' : ''}`}
                src={crop.imageUrl}
                alt={
                  shownName
                    ? `Portrait of ${shownName}`
                    : progressiveZoom
                      ? 'Today’s character clue. Wrong guesses zoom out the crop.'
                      : 'Today’s character clue.'
                }
                fallbackLabel="Character image unavailable"
                draggable={false}
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          {shownName && (
            <div className="crop-clue-reveal" aria-live="polite">
              <p className="crop-clue-reveal-kicker">Depicted character</p>
              <p className="crop-clue-reveal-name">{shownName}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
