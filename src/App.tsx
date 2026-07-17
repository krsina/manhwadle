import { useCallback, useMemo, useState } from 'react'
import { APP_NAME } from './brand'
import {
  ArchiveButton,
  ArchiveCalendarModal,
} from './components/ArchiveCalendarModal'
import { AuthButton } from './components/AuthButton'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { HowToPlay } from './components/howto/HowToPlay'
import {
  loadStoredModeId,
  ModeSwitcher,
  readModeIdFromUrl,
  saveStoredModeId,
} from './components/ModeSwitcher'
import { ReaderTastePrompt } from './components/ReaderTastePrompt'
import { StatsButton } from './components/StatsButton'
import { ThemeToggle } from './components/ThemeToggle'
import manhwaData from './data/manhwa.json'
import type { Manhwa } from './lib/anilist-types'
import { isArchiveDate, readDateKeyFromUrl, writeDateKeyToUrl } from './lib/archive'
import { getTodayKey } from './lib/daily'
import {
  filterPoolByTaste,
  loadReaderTaste,
  readerTasteLabel,
  saveReaderTaste,
  type ReaderTaste,
} from './lib/readerTaste'
import { catalogSizeLabel } from './lib/catalogConfig'
import { syncAfterLocalChange } from './lib/sync'
import type { StatsModeId } from './lib/stats'
import { resolveActiveMode } from './modes'
import './styles.css'

const fullPool = manhwaData as Manhwa[]

function initialModeId(): string {
  return readModeIdFromUrl() || loadStoredModeId() || resolveActiveMode().id
}

function initialDateKey(): string {
  return readDateKeyFromUrl() || getTodayKey()
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
  const [dateKey, setDateKey] = useState(initialDateKey)
  const [showTasteEditor, setShowTasteEditor] = useState(false)
  const [showArchive, setShowArchive] = useState(false)

  const mode = resolveActiveMode(modeId)
  const ModeGame = mode.Component
  const archive = isArchiveDate(dateKey)

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

  function handleDateSelect(next: string) {
    setDateKey(next)
    writeDateKeyToUrl(next)
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
      <header className="site-header">
        <div className="site-header-top">
          <div className="site-brand">
            <span className="site-brand-mark" aria-hidden="true">M</span>
            <div>
              <p className="site-brand-name">{APP_NAME}</p>
              <p className="site-brand-tagline">A daily manhwa guessing game</p>
            </div>
          </div>
          <div className="site-actions">
            <HowToPlay modeId={mode.id} guide={mode.howTo} />
            {taste && (
              <StatsButton
                modeId={mode.id as StatsModeId}
                taste={taste}
                maxGuesses={mode.maxGuesses}
              />
            )}
            <ArchiveButton
              onClick={() => {
                if (!taste) return
                setShowArchive(true)
              }}
            />
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
        <div className="site-nav">
          <span className="site-nav-label">Game mode</span>
          <ModeSwitcher activeId={mode.id} onChange={handleModeChange} />
        </div>
      </header>

      {taste ? (
        <ModeGame
          key={`${mode.id}-${taste}-${dateKey}`}
          pool={answerPool}
          guessPool={answerPool}
          taste={taste}
          dateKey={dateKey}
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
        {archive && (
          <p className="footer-archive">
            <button
              type="button"
              className="footer-taste-btn"
              onClick={() => handleDateSelect(getTodayKey())}
            >
              Leave archive · back to today
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
      {taste && (
        <ArchiveCalendarModal
          open={showArchive}
          taste={taste}
          selectedDateKey={dateKey}
          onSelectDate={handleDateSelect}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  )
}

/**
 * Shell: resolve which guessing variant to run.
 * Mode comes from ?mode= / #hash, then localStorage, then default.
 * Reader taste gates first visit and filters the daily answer + guess pools.
 * Optional ?date=YYYY-MM-DD opens an archive puzzle for that UTC day.
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
