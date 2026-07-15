import type { CharacterCropEntry } from '../lib/crops'
import { clampFocus, cropZoomScale } from '../lib/crops'

interface CharacterClueProps {
  crop: CharacterCropEntry
  failedGuesses: number
  finished: boolean
  maxGuesses: number
}

/** Progressive zoom-out in a portrait frame (same height budget as the old 16:10 slot). */
export function CharacterClue({
  crop,
  failedGuesses,
  finished,
  maxGuesses,
}: CharacterClueProps) {
  const scale = cropZoomScale(failedGuesses, { finished })
  const focusX = clampFocus(crop.focusX)
  const focusY = clampFocus(crop.focusY, 28)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)

  return (
    <section className="crop-clue" aria-label="Today's character clue">
      <div className="crop-clue-header">
        <p className="clue-label">
          {finished ? 'Full reveal' : `Character clue ${step}/${maxGuesses}`}
        </p>
        {!finished && <p className="clue-hint">Wrong guesses zoom out</p>}
      </div>
      <div className="crop-frame-slot">
        <div className="crop-frame crop-frame-portrait">
          <div
            className="crop-zoom"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: `${focusX}% ${focusY}%`,
            }}
          >
            <img
              className="crop-image"
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
