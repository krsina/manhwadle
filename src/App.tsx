import { Suspense, useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OwnerDevRoute } from './components/OwnerDevRoute'
import { LocalDevOrOwnerRoute } from './components/LocalDevOrOwnerRoute'
import { StaffRoute } from './components/StaffRoute'
import { GachaLocalProvider } from './components/gacha/GachaLocalProvider'
import { lazyWithStaleReload } from './lib/lazyWithStaleReload'
import {
  loadReaderTaste,
  saveReaderTaste,
  type ReaderTaste,
} from './lib/readerTaste'
import { NEWS_PATH, newsPath } from './lib/routes'
import './styles.css'

const HomePage = lazyWithStaleReload(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const MilestonesPage = lazyWithStaleReload(() =>
  import('./pages/MilestonesPage').then((m) => ({ default: m.MilestonesPage })),
)
const PlayPage = lazyWithStaleReload(() =>
  import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })),
)
const VersusPage = lazyWithStaleReload(() =>
  import('./pages/VersusPage').then((m) => ({ default: m.VersusPage })),
)
const SettingsPage = lazyWithStaleReload(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const ShopPage = lazyWithStaleReload(() =>
  import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })),
)
const ShopCollectionPage = lazyWithStaleReload(() =>
  import('./pages/ShopCollectionPage').then((m) => ({ default: m.ShopCollectionPage })),
)
const LeaderboardPage = lazyWithStaleReload(() =>
  import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
)
const AnimationCreatorPage = lazyWithStaleReload(() =>
  import('./pages/AnimationCreatorPage').then((m) => ({ default: m.AnimationCreatorPage })),
)
const ActionStripPreviewPage = lazyWithStaleReload(() =>
  import('./pages/ActionStripPreviewPage').then((m) => ({ default: m.ActionStripPreviewPage })),
)
const AvatarBustCropPage = lazyWithStaleReload(() =>
  import('./pages/AvatarBustCropPage').then((m) => ({ default: m.AvatarBustCropPage })),
)
const VersusEffectsDemoPage = lazyWithStaleReload(() =>
  import('./pages/VersusEffectsDemoPage').then((m) => ({ default: m.VersusEffectsDemoPage })),
)
const GachaShopDemoPage = lazyWithStaleReload(() =>
  import('./pages/GachaShopDemoPage').then((m) => ({ default: m.GachaShopDemoPage })),
)
const NewAvatarsPreviewPage = lazyWithStaleReload(() =>
  import('./pages/NewAvatarsPreviewPage').then((m) => ({ default: m.NewAvatarsPreviewPage })),
)
const PrivacyPage = lazyWithStaleReload(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const AboutPage = lazyWithStaleReload(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
)
const HowItWorksPage = lazyWithStaleReload(() =>
  import('./pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })),
)
const DatabasePage = lazyWithStaleReload(() =>
  import('./pages/DatabasePage').then((m) => ({ default: m.DatabasePage })),
)
const TermsPage = lazyWithStaleReload(() =>
  import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const AttributionPage = lazyWithStaleReload(() =>
  import('./pages/AttributionPage').then((m) => ({ default: m.AttributionPage })),
)
const ModerationAppealsPage = lazyWithStaleReload(() =>
  import('./pages/ModerationAppealsPage').then((m) => ({
    default: m.ModerationAppealsPage,
  })),
)
const UpdatesPage = lazyWithStaleReload(() =>
  import('./pages/UpdatesPage').then((m) => ({ default: m.UpdatesPage })),
)
const UpdateDetailPage = lazyWithStaleReload(() =>
  import('./pages/UpdateDetailPage').then((m) => ({ default: m.UpdateDetailPage })),
)
const StaffDashboardPage = lazyWithStaleReload(() =>
  import('./pages/StaffDashboardPage').then((m) => ({ default: m.StaffDashboardPage })),
)
const StaffModerationPage = lazyWithStaleReload(() =>
  import('./pages/StaffDashboardPage').then((m) => ({ default: m.StaffModerationPage })),
)
const StaffCommentsPage = lazyWithStaleReload(() =>
  import('./pages/StaffDashboardPage').then((m) => ({ default: m.StaffCommentsPage })),
)
const AnalyticsDashboardPage = lazyWithStaleReload(() =>
  import('./pages/AnalyticsDashboardPage').then((m) => ({
    default: m.AnalyticsDashboardPage,
  })),
)

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Loading…
    </div>
  )
}

function LegacyUpdateRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={newsPath(slug)} replace />
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
        <GachaLocalProvider>
          <BrowserRouter>
          <Routes>
            <Route element={<AppLayout taste={taste} onTasteChange={handleTasteChange} />}>
              <Route
                index
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HomePage taste={taste} setTaste={handleTasteChange} />
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
                path="versus"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <VersusPage />
                  </Suspense>
                }
              />
              <Route
                path="versus/:roomId"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <VersusPage />
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
                path="shop/collection"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ShopCollectionPage />
                  </Suspense>
                }
              />
              <Route
                path="leaderboard"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <LeaderboardPage />
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
                path="dev/avatar-bust-crops"
                element={
                  <LocalDevOrOwnerRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <AvatarBustCropPage />
                    </Suspense>
                  </LocalDevOrOwnerRoute>
                }
              />
              <Route
                path="dev/versus-effects"
                element={
                  <LocalDevOrOwnerRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <VersusEffectsDemoPage />
                    </Suspense>
                  </LocalDevOrOwnerRoute>
                }
              />
              <Route
                path="dev/gacha-shop"
                element={
                  <LocalDevOrOwnerRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <GachaShopDemoPage />
                    </Suspense>
                  </LocalDevOrOwnerRoute>
                }
              />
              <Route
                path="dev/new-avatars"
                element={
                  <LocalDevOrOwnerRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <NewAvatarsPreviewPage />
                    </Suspense>
                  </LocalDevOrOwnerRoute>
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
                path="news"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <UpdatesPage />
                  </Suspense>
                }
              />
              <Route
                path="news/:slug"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <UpdateDetailPage />
                  </Suspense>
                }
              />
              <Route path="updates" element={<Navigate to={NEWS_PATH} replace />} />
              <Route path="updates/:slug" element={<LegacyUpdateRedirect />} />
              <Route
                path="database"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DatabasePage taste={taste} />
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
              <Route
                path="staff"
                element={
                  <StaffRoute>
                    <Suspense fallback={<RouteFallback />}>
                      <StaffDashboardPage />
                    </Suspense>
                  </StaffRoute>
                }
              >
                <Route
                  path="analytics"
                  element={
                    <StaffRoute ownerOnly>
                      <Suspense fallback={<RouteFallback />}>
                        <AnalyticsDashboardPage />
                      </Suspense>
                    </StaffRoute>
                  }
                />
                <Route
                  path="moderation"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <StaffModerationPage />
                    </Suspense>
                  }
                />
                <Route
                  path="comments"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <StaffCommentsPage />
                    </Suspense>
                  }
                />
              </Route>
              <Route path="play" element={<Navigate to="/play/summary" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </GachaLocalProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
