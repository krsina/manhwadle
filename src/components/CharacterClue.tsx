import type { CharacterCropEntry } from '../lib/crops'
import { clampFocus, cropZoomScale } from '../lib/crops'
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
}

/** Progressive zoom-out in a portrait frame (same height budget as the old 16:10 slot). */
export function CharacterClue({
  crop,
  failedGuesses,
  finished,
  maxGuesses,
  canRevealMore = false,
  onRevealMore,
  grayscale = false,
}: CharacterClueProps) {
  const scale = cropZoomScale(failedGuesses, { finished })
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
            {finished ? 'Full reveal' : `Character clue ${step}/${maxGuesses}`}
          </p>
          {!finished && (
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
            <img
              className={`crop-image${grayscale ? ' is-grayscale' : ''}`}
              src={crop.imageUrl}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
