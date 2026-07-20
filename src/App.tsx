import { lazy, Suspense, useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OwnerDevRoute } from './components/OwnerDevRoute'
import {
  loadReaderTaste,
  saveReaderTaste,
  type ReaderTaste,
} from './lib/readerTaste'
import './styles.css'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const MilestonesPage = lazy(() =>
  import('./pages/MilestonesPage').then((m) => ({ default: m.MilestonesPage })),
)
const PlayPage = lazy(() =>
  import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const ShopPage = lazy(() =>
  import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })),
)
const AnimationCreatorPage = lazy(() =>
  import('./pages/AnimationCreatorPage').then((m) => ({ default: m.AnimationCreatorPage })),
)
const ActionStripPreviewPage = lazy(() =>
  import('./pages/ActionStripPreviewPage').then((m) => ({ default: m.ActionStripPreviewPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
)
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })),
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
                path="milestones"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <MilestonesPage />
                  </Suspense>
                }
              />
              <Route path="trophies" element={<Navigate to="/milestones" replace />} />
              <Route
                path="play/:mode"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PlayPage taste={taste} setTaste={handleTasteChange} />
                  </Suspense>
                }
              />
              <Route
                path="shop"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ShopPage />
                  </Suspense>
                }
              />
              <Route
                path="dev/animations"
                element={
                  <OwnerDevRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <AnimationCreatorPage />
                    </Suspense>
                  </OwnerDevRoute>
                }
              />
              <Route
                path="dev/action-strip-preview"
                element={
                  <OwnerDevRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <ActionStripPreviewPage />
                    </Suspense>
                  </OwnerDevRoute>
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
                path="about"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <AboutPage />
                  </Suspense>
                }
              />
              <Route
                path="how-it-works"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HowItWorksPage />
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
