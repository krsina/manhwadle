import { useState } from 'react'
import manhwaData from './data/manhwa.json'
import type { Manhwa } from './lib/anilist-types'
import {
  loadStoredModeId,
  ModeSwitcher,
  readModeIdFromUrl,
  saveStoredModeId,
} from './components/ModeSwitcher'
import { resolveActiveMode } from './modes'
import './styles.css'

const pool = manhwaData as Manhwa[]

function initialModeId(): string {
  return readModeIdFromUrl() || loadStoredModeId() || resolveActiveMode().id
}

/**
 * Shell: resolve which guessing variant to run.
 * Mode comes from ?mode= / #hash, then localStorage, then default.
 */
function App() {
  const [modeId, setModeId] = useState(initialModeId)
  const mode = resolveActiveMode(modeId)
  const ModeGame = mode.Component

  function handleModeChange(nextId: string) {
    setModeId(nextId)
    saveStoredModeId(nextId)
    const url = new URL(window.location.href)
    url.searchParams.set('mode', nextId)
    url.hash = ''
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <ModeSwitcher activeId={mode.id} onChange={handleModeChange} />
      <ModeGame key={mode.id} pool={pool} />
      <footer className="footer">
        <p>
          Data from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . Top 500 Korean manhwa by popularity.
        </p>
      </footer>
    </div>
  )
}

export default App
