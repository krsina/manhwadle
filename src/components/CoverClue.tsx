import {
  clampFocus,
  coverFocusOrigin,
  cropZoomScale,
} from '../lib/cover'

interface CoverClueProps {
  imageUrl: string
  manhwaId: number
  dateKey: string
  seedPrefix: string
  failedGuesses: number
  finished: boolean
  maxGuesses: number
}

/** Progressive zoom-out on manhwa cover art (portrait frame, like Character). */
export function CoverClue({
  imageUrl,
  manhwaId,
  dateKey,
  seedPrefix,
  failedGuesses,
  finished,
  maxGuesses,
}: CoverClueProps) {
  const scale = cropZoomScale(failedGuesses, { finished })
  const { focusX, focusY } = coverFocusOrigin(manhwaId, dateKey, seedPrefix)
  const originX = clampFocus(focusX)
  const originY = clampFocus(focusY, 35)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)

  return (
    <section className="crop-clue" aria-label="Today's cover clue">
      <div className="crop-clue-header">
        <p className="clue-label">
          {finished ? 'Full reveal' : `Cover clue ${step}/${maxGuesses}`}
        </p>
        {!finished && <p className="clue-hint">Wrong guesses zoom out</p>}
      </div>
      <div className="crop-frame-slot">
        <div className="crop-frame crop-frame-portrait">
          <div
            className="crop-zoom"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: `${originX}% ${originY}%`,
            }}
          >
            <img
              className="crop-image"
              src={imageUrl}
              alt=""
              draggable={false}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
