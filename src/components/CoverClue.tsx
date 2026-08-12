import {
  clampFocus,
  coverFocusOrigin,
  cropPixelScale,
  cropZoomScale,
} from '../lib/cover'
import { CropPixelateCanvas } from './CropPixelateCanvas'
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
  /**
   * Progressive zoom-out ladder. Defaults to on for Cover play.
   */
  progressiveZoom?: boolean
  /**
   * Progressive pixelation ladder (hard mode). Stacks with zoom — starts
   * chunky and clears after wrong guesses.
   */
  progressivePixelate?: boolean
  focusX?: number
  focusY?: number
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
  progressiveZoom = true,
  progressivePixelate = false,
  focusX,
  focusY,
}: CoverClueProps) {
  const scale = progressiveZoom
    ? cropZoomScale(failedGuesses, { finished })
    : 1
  const pixelScale = progressivePixelate
    ? cropPixelScale(failedGuesses, { finished })
    : 1
  const generatedFocus = coverFocusOrigin(manhwaId, dateKey, seedPrefix)
  const originX = clampFocus(focusX ?? generatedFocus.focusX)
  const originY = clampFocus(focusY ?? generatedFocus.focusY, 35)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)
  const progressive = progressiveZoom || progressivePixelate
  const hintText =
    progressiveZoom && progressivePixelate
      ? 'Wrong guesses zoom out and clear pixels'
      : progressivePixelate
        ? 'Wrong guesses clear the pixels'
        : 'Wrong guesses zoom out'

  return (
    <section className="crop-clue" aria-label="Cover clue">
      <div className="crop-clue-column">
        <div className="crop-clue-header">
          <p className="clue-label">
            {finished
              ? 'Full reveal'
              : progressive
                ? `Cover clue ${step}/${maxGuesses}`
                : 'Cover clue'}
          </p>
          {!finished && progressive && (
            <div className="clue-hint-row">
              <p className="clue-hint">{hintText}</p>
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
          <CropPixelateCanvas
            src={imageUrl}
            alt={
              progressiveZoom && progressivePixelate
                ? 'Cover clue. Wrong guesses zoom out and clear the pixels.'
                : progressivePixelate
                  ? 'Cover clue. Wrong guesses clear the pixels.'
                  : progressiveZoom
                    ? 'Cover clue. Wrong guesses zoom out the crop.'
                    : 'Cover clue.'
            }
            fallbackLabel="Cover unavailable"
            zoomScale={scale}
            focusX={originX}
            focusY={originY}
            pixelSize={pixelScale}
            grayscale={grayscale}
          />
        </div>
      </div>
    </section>
  )
}
