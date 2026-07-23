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
}: CharacterClueProps) {
  const scale = progressiveZoom
    ? cropZoomScale(failedGuesses, { finished })
    : 1
  const focusX = clampFocus(crop.focusX)
  const focusY = clampFocus(crop.focusY, 28)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)

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
                progressiveZoom
                  ? 'Today’s character clue. Wrong guesses zoom out the crop.'
                  : 'Today’s character clue.'
              }
              fallbackLabel="Character image unavailable"
              draggable={false}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
