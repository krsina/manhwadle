import { useEffect, useState } from 'react'
import {
  loadResultModalDemoFlags,
  saveResultModalDemoFlags,
  subscribeResultModalDemoFlags,
  type ResultModalDemoFlags,
} from '../lib/resultModalDemo'

const TOGGLES: {
  key: keyof ResultModalDemoFlags
  label: string
  hint: string
}[] = [
  {
    key: 'emojiGrid',
    label: 'Emoji grid',
    hint: 'Plain centered emoji rows (no box) — like the clipboard artifact',
  },
  {
    key: 'streakStrip',
    label: 'Stats strip',
    hint: 'Wordle-style Played / Win% / Streak / Max under the score',
  },
  {
    key: 'sharePolish',
    label: 'Share polish',
    hint: 'Countdown + mini grid + Share (✦ on double solve) + toast',
  },
  {
    key: 'shareCluster',
    label: 'Share cluster',
    hint: 'Needs share polish: score+grid in a chip, green/grey tint, tap grid to copy',
  },
]

/** Side panel — DEV only — toggles ResultModal demo features. */
export function ResultModalDevPanel() {
  const [flags, setFlags] = useState(loadResultModalDemoFlags)

  useEffect(() => subscribeResultModalDemoFlags(() => setFlags(loadResultModalDemoFlags())), [])

  function setFlag(key: keyof ResultModalDemoFlags, value: boolean) {
    const next = { ...flags, [key]: value }
    setFlags(next)
    saveResultModalDemoFlags(next)
  }

  function enableAll() {
    const next: ResultModalDemoFlags = {
      emojiGrid: true,
      streakStrip: true,
      sharePolish: true,
      shareCluster: true,
    }
    setFlags(next)
    saveResultModalDemoFlags(next)
  }

  function resetAll() {
    const next: ResultModalDemoFlags = {
      emojiGrid: false,
      streakStrip: false,
      sharePolish: false,
      shareCluster: false,
    }
    setFlags(next)
    saveResultModalDemoFlags(next)
  }

  return (
    <aside className="result-dev-panel" aria-label="Result modal demo toggles">
      <p className="archive-dev-kicker">DEV</p>
      <h3 className="archive-dev-title">Result demo</h3>
      <p className="archive-dev-note">
        Toggle post-solve extras without shipping them. Off = current production look.
      </p>

      <ul className="result-dev-toggles">
        {TOGGLES.map((toggle) => (
          <li key={toggle.key}>
            <label className="result-dev-toggle">
              <input
                type="checkbox"
                checked={flags[toggle.key]}
                onChange={(e) => setFlag(toggle.key, e.target.checked)}
              />
              <span>
                <span className="result-dev-toggle-label">{toggle.label}</span>
                <span className="result-dev-toggle-hint">{toggle.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="archive-dev-actions">
        <button type="button" className="btn btn-primary" onClick={enableAll}>
          Enable all
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetAll}>
          Reset
        </button>
      </div>
    </aside>
  )
}
