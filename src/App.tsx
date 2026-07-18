import { lazy, Suspense, useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  loadReaderTaste,
  saveReaderTaste,
  type ReaderTaste,
} from './lib/readerTaste'
import { telemetry } from './lib/telemetry'
import './styles.css'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const PlayPage = lazy(() =>
  import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const TermsPage = lazy(() =>
  import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const AttributionPage = lazy(() =>
  import('./pages/AttributionPage').then((m) => ({ default: m.AttributionPage })),
)
const ModerationAppealsPage = lazy(() =>
  import('./pages/ModerationAppealsPage').then((m) => ({
    default: m.ModerationAppealsPage,
  })),
)

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Loading…
    </div>
  )
}

/**
 * Shell: homepage, play routes, settings, legal.
 * Legacy `?mode=` / hash links redirect into `/play/:mode`.
 * Taste gates only when entering a game.
 */
function App() {
  const [taste, setTaste] = useState<ReaderTaste | null>(() => loadReaderTaste())

  const handleSyncedTaste = useCallback((next: ReaderTaste) => {
    saveReaderTaste(next)
    setTaste(next)
  }, [])

  function handleTasteChange(next: ReaderTaste) {
    saveReaderTaste(next)
    setTaste(next)
    telemetry.tasteSelected(next)
  }

  return (
    <ErrorBoundary label="app-root">
      <AuthProvider onSyncedTaste={handleSyncedTaste}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout taste={taste} onTasteChange={handleTasteChange} />}>
              <Route
                index
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HomePage taste={taste} />
                  </Suspense>
                }
              />
              <Route
                path="play/:mode"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PlayPage taste={taste} setTaste={handleTasteChange} />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SettingsPage />
                  </Suspense>
                }
              />
              <Route
                path="privacy"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PrivacyPage />
                  </Suspense>
                }
              />
              <Route
                path="terms"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TermsPage />
                  </Suspense>
                }
              />
              <Route
                path="attribution"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <AttributionPage />
                  </Suspense>
                }
              />
              <Route
                path="moderation"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ModerationAppealsPage />
                  </Suspense>
                }
              />
              <Route path="play" element={<Navigate to="/play/summary" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
