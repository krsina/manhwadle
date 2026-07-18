import {
  clampFocus,
  coverFocusOrigin,
  cropZoomScale,
} from '../lib/cover'
import { RevealMoreButton } from './RevealMoreButton'

interface CoverClueProps {
  imageUrl: string
  manhwaId: number
  dateKey: string
  seedPrefix: string
  failedGuesses: number
  finished: boolean
  maxGuesses: number
  canRevealMore?: boolean
  onRevealMore?: () => void
  /** Forced grayscale (hard mode) */
  grayscale?: boolean
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
  canRevealMore = false,
  onRevealMore,
  grayscale = false,
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
      <div className="crop-clue-column">
        <div className="crop-clue-header">
          <p className="clue-label">
            {finished ? 'Full reveal' : `Cover clue ${step}/${maxGuesses}`}
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
              transformOrigin: `${originX}% ${originY}%`,
            }}
          >
            <img
              className={`crop-image${grayscale ? ' is-grayscale' : ''}`}
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
