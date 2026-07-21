import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArchiveButton,
  ArchiveCalendarModal,
} from '../components/ArchiveCalendarModal'
import { HowToPlay } from '../components/howto/HowToPlay'
import { ModeSwitcher, saveStoredModeId } from '../components/ModeSwitcher'
import { ReaderTastePrompt } from '../components/ReaderTastePrompt'
import { StatsButton } from '../components/StatsButton'
import { useAuth } from '../components/AuthProvider'
import type { Manhwa } from '../lib/anilist-types'
import { isArchiveDate, parseDateKey, writeDateKeyToUrl } from '../lib/archive'
import { loadClientCatalog } from '../lib/clientCatalog'
import { getTodayKey } from '../lib/daily'
import {
  filterPoolByTaste,
  saveReaderTaste,
  type ReaderTaste,
} from '../lib/readerTaste'
import { syncAfterLocalChange } from '../lib/sync'
import type { StatsModeId } from '../lib/stats'
import { resolveActiveMode } from '../modes'
import { parsePlayModeParam, playPath } from '../lib/routes'
import { fetchPublicSiteStatus } from '../lib/leaderboardApi'
import { noteSecretRoundStart, reportSecretEvent } from '../lib/secretEvents'

interface PlayPageProps {
  taste: ReaderTaste | null
  setTaste: (taste: ReaderTaste) => void
}

export function PlayPage({ taste, setTaste }: PlayPageProps) {
  const { mode: modeParam } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const modeId = parsePlayModeParam(modeParam) ?? resolveActiveMode().id
  const mode = resolveActiveMode(modeId)
  const ModeGame = mode.Component

  const dateFromUrl = parseDateKey(searchParams.get('date'))
  const [dateKey, setDateKey] = useState(dateFromUrl || getTodayKey())
  const [showArchive, setShowArchive] = useState(false)
  const [archiveAfterTaste, setArchiveAfterTaste] = useState(false)
  const [modeAvailable, setModeAvailable] = useState(true)
  const [modeMessage, setModeMessage] = useState<string | null>(null)
  const [fullPool, setFullPool] = useState<Manhwa[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadClientCatalog()
      .then((data) => {
        if (!cancelled) setFullPool(data)
      })
      .catch(() => {
        if (!cancelled) setCatalogError('Could not load the title catalog.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const parsed = parsePlayModeParam(modeParam)
    if (!parsed) {
      navigate(playPath(resolveActiveMode().id, dateFromUrl), { replace: true })
      return
    }
    saveStoredModeId(parsed)
  }, [modeParam, navigate, dateFromUrl])

  useEffect(() => {
    const next = dateFromUrl || getTodayKey()
    setDateKey(next)
  }, [dateFromUrl])

  useEffect(() => {
    let cancelled = false
    void fetchPublicSiteStatus().then((result) => {
      if (cancelled || !result.ok) return
      const row = result.status.modes.find((m) => m.mode === mode.id)
      setModeAvailable(row ? row.available : true)
      setModeMessage(row?.message ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [mode.id])

  const archive = isArchiveDate(dateKey)

  useEffect(() => {
    if (!user || archive) return
    void reportSecretEvent('mode_open', { mode: mode.id })
    noteSecretRoundStart(mode.id, dateKey)
  }, [user, archive, mode.id, dateKey])

  const answerPool = useMemo(() => {
    if (!fullPool) return []
    return taste ? filterPoolByTaste(fullPool, taste) : fullPool
  }, [taste, fullPool])

  function handleModeChange(nextId: string) {
    saveStoredModeId(nextId)
    navigate(playPath(nextId, archive ? dateKey : null))
  }

  function handleDateSelect(next: string) {
    setDateKey(next)
    writeDateKeyToUrl(next)
    navigate(playPath(mode.id, next === getTodayKey() ? null : next), { replace: true })
  }

  function requestArchive() {
    if (!taste) {
      setArchiveAfterTaste(true)
      return
    }
    setShowArchive(true)
  }

  function handleTasteSelect(next: ReaderTaste) {
    saveReaderTaste(next)
    setTaste(next)
    syncAfterLocalChange(user?.id).taste(next)
  }

  useEffect(() => {
    if (!taste || !archiveAfterTaste) return
    setArchiveAfterTaste(false)
    setShowArchive(true)
  }, [taste, archiveAfterTaste])

  return (
    <div className="play-page">
      <div className="play-toolbar">
        <div className="site-nav play-mode-nav">
          <span className="site-nav-label">Game mode</span>
          <ModeSwitcher activeId={mode.id} onChange={handleModeChange} />
        </div>
        <div className="play-toolbar-actions">
          {taste && <HowToPlay modeId={mode.id} guide={mode.howTo} />}
          {taste && (
            <StatsButton
              modeId={mode.id as StatsModeId}
              taste={taste}
              maxGuesses={mode.maxGuesses}
            />
          )}
          <ArchiveButton onClick={requestArchive} />
        </div>
      </div>

      <header className="play-mode-hero">
        <h1 className="play-mode-title">{mode.name}</h1>
        <p className="play-mode-tagline">{mode.tagline}</p>
      </header>

      {!modeAvailable ? (
        <section className="mode-empty">
          <p className="mode-empty-title">Mode unavailable</p>
          <p className="mode-empty-body">
            {modeMessage ||
              'This mode is temporarily offline. Try another mode or check back later.'}
          </p>
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
        </section>
      ) : catalogError ? (
        <section className="mode-empty" role="alert">
          <p className="mode-empty-title">Catalog unavailable</p>
          <p className="mode-empty-body">{catalogError}</p>
        </section>
      ) : !fullPool ? (
        <section className="mode-empty" aria-busy="true">
          <p className="mode-empty-title">Loading catalog…</p>
        </section>
      ) : taste ? (
        <Suspense
          fallback={
            <section className="mode-empty" aria-busy="true">
              <p className="mode-empty-title">Loading game…</p>
            </section>
          }
        >
          <ModeGame
            key={`${mode.id}-${taste}-${dateKey}`}
            pool={answerPool}
            guessPool={answerPool}
            taste={taste}
            dateKey={dateKey}
          />
        </Suspense>
      ) : (
        <section className="mode-empty taste-gate">
          <p className="mode-empty-title">Choose what you usually read</p>
          <p className="mode-empty-body">
            Pick a reading preference to unlock today’s puzzle. You can change it later in
            Settings.
          </p>
        </section>
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

      {!taste && (modeAvailable || archiveAfterTaste) && (
        <ReaderTastePrompt onSelect={handleTasteSelect} />
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
