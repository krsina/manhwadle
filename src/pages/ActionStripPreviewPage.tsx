import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEV_ANIMATIONS_PATH, HOME_PATH } from '../lib/routes'

const STRIP_SRC = '/dev/plum-action-18-6x3-strip.png?v=3'
const FRAMES = 18
const CELL = 256

/** Dev-only temp preview for the oneshot 18-cell action strip. */
export function ActionStripPreviewPage() {
  if (!import.meta.env.DEV) {
    return (
      <main className="animation-creator">
        <p>Only available in local development.</p>
        <Link to={HOME_PATH}>Back home</Link>
      </main>
    )
  }

  return <ActionStripPreviewApp />
}

function ActionStripPreviewApp() {
  const [playing, setPlaying] = useState(true)
  const [ms, setMs] = useState(140)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES)
    }, ms)
    return () => window.clearInterval(id)
  }, [playing, ms])

  return (
    <main className="action-strip-preview">
      <header>
        <p className="modal-kicker">Dev only · temp</p>
        <h1>Plum action strip preview</h1>
        <p className="action-strip-preview-sub">
          18-cell oneshot (3×6-cell sheets) · {CELL}×{CELL} cells
        </p>
        <p className="action-strip-preview-nav">
          <Link to={DEV_ANIMATIONS_PATH}>Animation Creator</Link>
          {' · '}
          <Link to={HOME_PATH}>Home</Link>
        </p>
      </header>

      <div className="action-strip-preview-controls">
        <button
          type="button"
          className={`btn ${playing ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setFrame(0)}>
          Reset
        </button>
        <label>
          Speed
          <input
            type="range"
            min={60}
            max={320}
            step={20}
            value={ms}
            onChange={(e) => setMs(Number(e.target.value))}
          />
          <span>{ms}ms</span>
        </label>
        <span className="action-strip-preview-meta">
          frame {frame + 1} / {FRAMES}
        </span>
      </div>

      <div className="action-strip-preview-stage" style={{ width: CELL * 2, height: CELL * 2 }}>
        <div className="action-strip-preview-clip" style={{ width: CELL * 2, height: CELL * 2 }}>
          <img
            src={STRIP_SRC}
            alt=""
            width={CELL * FRAMES * 2}
            height={CELL * 2}
            style={{
              imageRendering: 'pixelated',
              transform: `translateX(-${frame * CELL * 2}px)`,
              display: 'block',
            }}
          />
        </div>
      </div>

      <p className="action-strip-preview-hint">
        Source: <code>public/dev/plum-action-18-6x3-strip.png</code>
      </p>
    </main>
  )
}
