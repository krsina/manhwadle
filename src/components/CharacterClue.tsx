import type { CharacterCropEntry } from '../lib/crops'
import { clampFocus, cropPixelScale, cropZoomScale } from '../lib/crops'
import { CropPixelateCanvas } from './CropPixelateCanvas'
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
   * Progressive zoom-out ladder. Hard mode keeps this; normal Character mode
   * shows the full portrait from the start.
   */
  progressiveZoom?: boolean
  /**
   * Progressive pixelation ladder (hard mode). Stacks with zoom — starts
   * chunky and clears after wrong guesses / Reveal more.
   */
  progressivePixelate?: boolean
  /**
   * Shown under the clue after the round ends. On a win, wait until the bonus
   * name guess is answered so the clue board does not spoil it.
   */
  revealName?: string | null
  /**
   * Keep the frame empty until the daily answer settles; the pre-settle crop
   * is a local placeholder and would flash the wrong character.
   */
  loading?: boolean
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
  progressivePixelate = false,
  revealName = null,
  loading = false,
}: CharacterClueProps) {
  const scale = progressiveZoom
    ? cropZoomScale(failedGuesses, { finished })
    : 1
  const pixelScale = progressivePixelate
    ? cropPixelScale(failedGuesses, { finished })
    : 1
  const focusX = clampFocus(crop.focusX)
  const focusY = clampFocus(crop.focusY, 28)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)
  const shownName = finished ? revealName?.trim() || null : null
  const progressive = progressiveZoom || progressivePixelate
  const hintText =
    progressiveZoom && progressivePixelate
      ? 'Wrong guesses zoom out and clear pixels'
      : progressivePixelate
        ? 'Wrong guesses clear the pixels'
        : 'Wrong guesses zoom out'

  return (
    <section className="crop-clue" aria-label="Character clue">
      <div className="crop-clue-column">
        <div className="crop-clue-header">
          <p className="clue-label">
            {finished
              ? 'Full reveal'
              : progressive
                ? `Character clue ${step}/${maxGuesses}`
                : 'Character clue'}
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
        <div className={`crop-reveal-stage${shownName ? ' has-name' : ''}`}>
          <div
            className="crop-frame crop-frame-portrait"
            aria-busy={loading || undefined}
          >
            {!loading && (
              <CropPixelateCanvas
                src={crop.imageUrl}
                alt={
                  shownName
                    ? `Portrait of ${shownName}`
                    : progressiveZoom && progressivePixelate
                      ? 'Character clue. Wrong guesses zoom out and clear the pixels.'
                      : progressivePixelate
                        ? 'Character clue. Wrong guesses clear the pixels.'
                        : progressiveZoom
                          ? 'Character clue. Wrong guesses zoom out the crop.'
                          : 'Character clue.'
                }
                fallbackLabel="Character image unavailable"
                zoomScale={scale}
                focusX={focusX}
                focusY={focusY}
                pixelSize={pixelScale}
                grayscale={grayscale}
                referrerPolicy="no-referrer"
              />
            )}
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
