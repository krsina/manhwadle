import { useCallback, useMemo, useState } from 'react'
import { AuthProvider, useAuth } from './components/AuthProvider'
import {
  loadStoredModeId,
  ModeSwitcher,
  readModeIdFromUrl,
  saveStoredModeId,
} from './components/ModeSwitcher'
import { ReaderTastePrompt } from './components/ReaderTastePrompt'
import manhwaData from './data/manhwa.json'
import type { Manhwa } from './lib/anilist-types'
import {
  filterPoolByTaste,
  loadReaderTaste,
  readerTasteLabel,
  saveReaderTaste,
  type ReaderTaste,
} from './lib/readerTaste'
import { catalogSizeLabel } from './lib/catalogConfig'
import { syncAfterLocalChange } from './lib/sync'
import { resolveActiveMode } from './modes'
import './styles.css'

const fullPool = manhwaData as Manhwa[]

function initialModeId(): string {
  return readModeIdFromUrl() || loadStoredModeId() || resolveActiveMode().id
}

function AppInner({
  taste,
  setTaste,
}: {
  taste: ReaderTaste | null
  setTaste: (taste: ReaderTaste) => void
}) {
  const { user } = useAuth()
  const [modeId, setModeId] = useState(initialModeId)
  const [showTasteEditor, setShowTasteEditor] = useState(false)

  const mode = resolveActiveMode(modeId)
  const ModeGame = mode.Component

  const answerPool = useMemo(
    () => (taste ? filterPoolByTaste(fullPool, taste) : fullPool),
    [taste],
  )

  function handleModeChange(nextId: string) {
    setModeId(nextId)
    saveStoredModeId(nextId)
    const url = new URL(window.location.href)
    url.searchParams.set('mode', nextId)
    url.hash = ''
    window.history.replaceState({}, '', url)
  }

  function handleTasteSelect(next: ReaderTaste) {
    saveReaderTaste(next)
    setTaste(next)
    setShowTasteEditor(false)
    syncAfterLocalChange(user?.id).taste(next)
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <ModeSwitcher activeId={mode.id} onChange={handleModeChange} />

      {taste ? (
        <ModeGame
          key={`${mode.id}-${taste}`}
          pool={answerPool}
          guessPool={answerPool}
          taste={taste}
        />
      ) : (
        <section className="mode-empty taste-gate">
          <p className="mode-empty-title">Choose what you usually read</p>
          <p className="mode-empty-body">
            Pick a reading preference to unlock today’s puzzle. You can change it later.
          </p>
        </section>
      )}

      <footer className="footer">
        <p>
          Data from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . {catalogSizeLabel()} Korean manhwa by popularity.
        </p>
        {taste && (
          <p className="footer-taste">
            <button
              type="button"
              className="footer-taste-btn"
              onClick={() => setShowTasteEditor(true)}
            >
              Reading preference: {readerTasteLabel(taste)}
            </button>
          </p>
        )}
      </footer>

      {!taste && <ReaderTastePrompt onSelect={handleTasteSelect} />}
      {taste && showTasteEditor && (
        <ReaderTastePrompt
          currentTaste={taste}
          onSelect={handleTasteSelect}
          onClose={() => setShowTasteEditor(false)}
        />
      )}
    </div>
  )
}

/**
 * Shell: resolve which guessing variant to run.
 * Mode comes from ?mode= / #hash, then localStorage, then default.
 * Reader taste gates first visit and filters the daily answer + guess pools.
 */
function App() {
  const [taste, setTaste] = useState<ReaderTaste | null>(() => loadReaderTaste())

  const handleSyncedTaste = useCallback((next: ReaderTaste) => {
    saveReaderTaste(next)
    setTaste(next)
  }, [])

  return (
    <AuthProvider onSyncedTaste={handleSyncedTaste}>
      <AppInner taste={taste} setTaste={setTaste} />
    </AuthProvider>
  )
}

export default App
