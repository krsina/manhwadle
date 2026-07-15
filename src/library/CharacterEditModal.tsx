import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  characterImageUrl,
  isCharacterEnabledForGuess,
  type Manhwa,
  type ManhwaCharacter,
} from '../lib/anilist-types'
import {
  CROP_ZOOM_STEPS,
  clampFocus,
  cropZoomScale,
  type CharacterCropEntry,
} from '../lib/crops'
import { characterModeMeta } from '../modes/character/config'
import { displayName } from './types'

/** Dwell time on each zoom step before advancing (ms). */
const PREVIEW_STEP_MS = 1600
/** Extra pause on the full reveal before looping (ms). */
const PREVIEW_HOLD_MS = 2200

interface CharacterEditModalProps {
  manhwa: Manhwa
  character: ManhwaCharacter
  crop: CharacterCropEntry | null
  onClose: () => void
  onSaveCrop: (crop: CharacterCropEntry) => void
  onRemoveCrop: () => void
  onToggleGuess: (useForGuess: boolean) => void
}

/** Modal: character details, default image, current crop, and focus-crop editor. */
export function CharacterEditModal({
  manhwa,
  character,
  crop,
  onClose,
  onSaveCrop,
  onRemoveCrop,
  onToggleGuess,
}: CharacterEditModalProps) {
  const defaultImage = characterImageUrl(character)
  const label =
    character.name.full || character.name.native || `Character #${character.id}`

  const [draftUrl, setDraftUrl] = useState(
    () => crop?.imageUrl?.trim() || defaultImage || '',
  )
  const [focusX, setFocusX] = useState(() => clampFocus(crop?.focusX, 50))
  const [focusY, setFocusY] = useState(() => clampFocus(crop?.focusY, 28))
  const [previewStep, setPreviewStep] = useState(0)
  const sourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Loop the same zoom-out ladder Character mode uses after each failed guess.
  useEffect(() => {
    setPreviewStep(0)
    const lastIndex = CROP_ZOOM_STEPS - 1
    let step = 0
    let timer = window.setTimeout(tick, PREVIEW_STEP_MS)

    function tick() {
      step += 1
      if (step > lastIndex) {
        step = 0
        setPreviewStep(0)
        timer = window.setTimeout(tick, PREVIEW_STEP_MS)
        return
      }
      setPreviewStep(step)
      timer = window.setTimeout(
        tick,
        step === lastIndex ? PREVIEW_HOLD_MS : PREVIEW_STEP_MS,
      )
    }

    return () => window.clearTimeout(timer)
  }, [focusX, focusY, draftUrl])

  function setFocusFromClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setFocusX(clampFocus(x))
    setFocusY(clampFocus(y))
  }

  function handleSave() {
    const imageUrl = draftUrl.trim()
    if (!imageUrl) return
    onSaveCrop({
      manhwaId: manhwa.id,
      title: displayName(manhwa),
      characterId: character.id,
      characterName: label,
      imageUrl,
      focusX,
      focusY,
      rank: crop?.rank,
    })
  }

  function useDefaultImage() {
    if (!defaultImage) return
    setDraftUrl(defaultImage)
    setFocusX(50)
    setFocusY(28)
  }

  const enabled = isCharacterEnabledForGuess(character)
  const hasExistingCrop = Boolean(crop?.imageUrl?.trim())
  const sourceUrl = draftUrl.trim() || defaultImage || ''
  const maxGuesses = characterModeMeta.maxGuesses
  const previewFinished = previewStep >= CROP_ZOOM_STEPS - 1
  const previewScale = cropZoomScale(previewStep, { finished: previewFinished })
  const previewClueStep = previewFinished
    ? maxGuesses
    : Math.min(previewStep + 1, maxGuesses)

  return (
    <div className="char-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="char-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="char-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="char-modal-header">
          <div>
            <p className="editor-kicker">Character</p>
            <h2 id="char-modal-title" className="char-modal-title">
              {label}
            </h2>
            <p className="editor-id">
              #{character.id}
              <span className={`character-role role-${character.role.toLowerCase()}`}>
                {character.role}
              </span>
              {character.favourites != null ? ` · ${character.favourites} favs` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="char-modal-body">
          <section className="char-modal-details">
            {character.name.native && (
              <p className="char-modal-native">{character.name.native}</p>
            )}
            {character.name.alternative?.length > 0 && (
              <p className="editor-help">
                Also known as: {character.name.alternative.join(', ')}
              </p>
            )}
            <p className="char-modal-desc">
              {character.description || 'No description on AniList.'}
            </p>
            <div className="character-card-actions">
              <button
                type="button"
                className={`btn ${enabled ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onToggleGuess(!enabled)}
              >
                {enabled ? 'Included for guesses' : 'Excluded from guesses'}
              </button>
              {character.siteUrl && (
                <a
                  className="btn btn-ghost"
                  href={character.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on AniList
                </a>
              )}
            </div>
          </section>

          <section className="char-modal-images">
            <div className="char-modal-panel">
              <h3>Default image</h3>
              <p className="editor-help">AniList portrait. Click the editor image to set focus.</p>
              {defaultImage ? (
                <img
                  className="char-modal-default"
                  src={defaultImage}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="char-modal-default is-empty">No default image</div>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!defaultImage}
                onClick={useDefaultImage}
              >
                Use default as crop source
              </button>
            </div>

            <div className="char-modal-panel">
              <h3>{hasExistingCrop ? 'Current crop' : 'Crop preview'}</h3>
              <p className="editor-help">
                {previewFinished
                  ? 'Full reveal — loops like a finished Character-mode round.'
                  : `Simulates wrong guesses zooming out · clue ${previewClueStep}/${maxGuesses}`}
              </p>
              {sourceUrl ? (
                <div className="editor-crop-preview char-modal-crop-preview">
                  <div
                    className="editor-crop-zoom"
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: `${focusX}% ${focusY}%`,
                    }}
                  >
                    <img
                      src={sourceUrl}
                      alt=""
                      draggable={false}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              ) : (
                <div className="char-modal-default is-empty">No crop yet</div>
              )}
            </div>
          </section>

          <section className="char-modal-editor">
            <h3>Make / edit crop</h3>
            <p className="editor-help">
              Click the image to place the zoom focus. Drag is not required — each click sets a new
              origin for the Character-mode reveal.
            </p>
            <Field label="Crop image URL">
              <input
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://… or /crops/105398-129928.jpg"
              />
            </Field>

            {sourceUrl ? (
              <div
                ref={sourceRef}
                className="char-focus-source"
                onClick={setFocusFromClick}
                role="presentation"
                title="Click to set focus point"
              >
                <img
                  src={sourceUrl}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                />
                <span
                  className="char-focus-mark"
                  style={{ left: `${focusX}%`, top: `${focusY}%` }}
                />
              </div>
            ) : (
              <p className="editor-help">Add an image URL to start a crop.</p>
            )}

            <div className="editor-grid">
              <Field label={`Focus X (${Math.round(focusX)})`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focusX}
                  onChange={(e) => setFocusX(Number(e.target.value))}
                />
              </Field>
              <Field label={`Focus Y (${Math.round(focusY)})`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focusY}
                  onChange={(e) => setFocusY(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="character-card-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!draftUrl.trim()}
                onClick={handleSave}
              >
                {hasExistingCrop ? 'Update crop' : 'Create crop'}
              </button>
              {hasExistingCrop && (
                <button type="button" className="btn btn-ghost" onClick={onRemoveCrop}>
                  Remove crop
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
