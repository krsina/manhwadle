import { useId, useState } from 'react'
import {
  SOLVE_SOUND_PAIRS,
  loadSolveSoundPairId,
  playSolveCelebrationSound,
  saveSolveSoundPairId,
  type SolveSoundPairId,
} from '../lib/solveCelebrationSounds'
import { Dialog } from './Dialog'

/** DEV-only launcher to A/B first-try + double-solve SFX pairs. */
export function SolveSoundTestLauncher() {
  const [open, setOpen] = useState(false)
  if (!import.meta.env.DEV) return null

  return (
    <>
      <button
        type="button"
        className="achievement-test-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Test solve SFX
      </button>
      <SolveSoundTestModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function SolveSoundTestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const [activeId, setActiveId] = useState<SolveSoundPairId>(() => loadSolveSoundPairId())
  const [notice, setNotice] = useState<string | null>(null)

  if (!import.meta.env.DEV || !open) return null

  function selectPair(id: SolveSoundPairId, label: string) {
    setActiveId(id)
    saveSolveSoundPairId(id)
    setNotice(`${label} is active for real first-try / double-solve wins.`)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="solve-sound-test-desc"
      backdropClassName="dev-tools-backdrop"
      panelClassName="dev-tools-panel solve-sound-test-panel"
      closeOnBackdrop
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Local only · temp</p>
      <h2 id={titleId} className="modal-title">
        Solve SFX pairs
      </h2>
      <p id="solve-sound-test-desc" className="auth-modal-intro">
        Preview powerful anime / manhwa first-try and golden double-solve cues. Selecting a pair
        also uses it on real wins until you change it.
      </p>

      {notice && (
        <p className="achievement-test-hint" role="status">
          {notice}
        </p>
      )}

      <ul className="solve-sound-test-list">
        {SOLVE_SOUND_PAIRS.map((pair) => {
          const selected = activeId === pair.id
          return (
            <li
              key={pair.id}
              className={`solve-sound-test-row${selected ? ' is-selected' : ''}`}
            >
              <div className="solve-sound-test-copy">
                <span className="solve-sound-test-name">{pair.label}</span>
                <span className="solve-sound-test-desc">{pair.blurb}</span>
              </div>
              <div className="solve-sound-test-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void playSolveCelebrationSound('first-try', pair.id)
                  }}
                >
                  First try
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void playSolveCelebrationSound('double-solve', pair.id)
                  }}
                >
                  Golden
                </button>
                <button
                  type="button"
                  className={`btn ${selected ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={selected}
                  onClick={() => selectPair(pair.id, pair.label)}
                >
                  {selected ? 'Active' : 'Use'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
