import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../brand'
import { AuthButton } from './AuthButton'
import { ThemeToggle } from './ThemeToggle'
import { PreferencesModal } from './PreferencesModal'
import { StreakBadge } from './StreakBadge'
import { UsernameOnboarding } from './UsernameOnboarding'
import { StatusBanner } from './StatusBanner'
import { DevToolsLauncher } from './DevToolsModal'
import { catalogSizeLabel } from '../lib/catalogConfig'
import {
  ABOUT_PATH,
  ATTRIBUTION_PATH,
  HOW_IT_WORKS_PATH,
  legacyPlayRedirectTarget,
  MODERATION_POLICY_PATH,
  PRIVACY_PATH,
  TERMS_PATH,
} from '../lib/routes'
import {
  fetchPublicSiteStatus,
  type PublicSiteStatus,
} from '../lib/leaderboardApi'
import type { ReaderTaste } from '../lib/readerTaste'
import { AppAnnouncer } from './AppAnnouncer'
import { NetworkStatus } from './NetworkStatus'
import { PointsBadge } from './PointsBadge'
import { useAuth } from './AuthProvider'
import {
  createBackgroundCultivationTracker,
  createKonamiListener,
  createTabTwinTracker,
  reportSecretEvent,
} from '../lib/secretEvents'
import { AchievementUnlockHost } from './AchievementUnlockHost'
import { AdChrome } from './AdChrome'

interface AppLayoutProps {
  taste: ReaderTaste | null
  onTasteChange: (taste: ReaderTaste) => void
}

export function AppLayout({ taste, onTasteChange }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [siteStatus, setSiteStatus] = useState<PublicSiteStatus | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)

  useEffect(() => {
    const target = legacyPlayRedirectTarget({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    })
    if (!target) return
    const current = `${location.pathname}${location.search}`
    if (target !== current) {
      navigate(target, { replace: true })
    }
  }, [location.pathname, location.search, location.hash, navigate])

  useEffect(() => {
    if (!user) return
    const stopBackground = createBackgroundCultivationTracker(() => {
      void reportSecretEvent('tab_open_24h')
    })
    const stopTwin = createTabTwinTracker(() => {
      void reportSecretEvent('tab_twin')
    })
    const stopKonami = createKonamiListener(() => {
      void reportSecretEvent('konami')
    })
    return () => {
      stopBackground()
      stopTwin()
      stopKonami()
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    void fetchPublicSiteStatus().then((result) => {
      if (cancelled || !result.ok) return
      setSiteStatus(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-top">
          <Link to="/" className="site-brand site-brand-link">
            <span className="site-brand-mark" aria-hidden="true">
              M
            </span>
            <div>
              <p className="site-brand-name">{APP_NAME}</p>
              <p className="site-brand-tagline">A daily manhwa guessing game</p>
            </div>
          </Link>
          <div className="site-actions">
            <StreakBadge />
            <PointsBadge />
            <a
              className="site-icon-btn site-kofi-link"
              href="https://ko-fi.com/krsina"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Support on Ko-fi"
              title="Support on Ko-fi"
            >
              <KofiCupIcon />
            </a>
            <ThemeToggle />
            <button
              type="button"
              className="site-icon-btn site-settings-link"
              aria-label="Preferences"
              title="Preferences"
              aria-haspopup="dialog"
              aria-expanded={prefsOpen}
              onClick={() => setPrefsOpen(true)}
            >
              <SettingsCogIcon />
            </button>
            <AuthButton />
          </div>
        </div>
      </header>

      <StatusBanner
        message={siteStatus?.bannerMessage ?? null}
        severity={siteStatus?.bannerSeverity}
        maintenanceActive={siteStatus?.maintenanceActive}
      />
      <NetworkStatus />
      <AppAnnouncer />

      <div className="page-with-ads" id="main-content">
        <Outlet />
        <AdChrome />
      </div>

      <footer className="footer">
        <p>
          Data from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . {catalogSizeLabel()} Korean manhwa by popularity.
        </p>
        <nav className="footer-legal" aria-label="Legal">
          <Link to={ABOUT_PATH}>About</Link>
          <Link to={HOW_IT_WORKS_PATH}>How it works</Link>
          <Link to={PRIVACY_PATH}>Privacy</Link>
          <Link to={TERMS_PATH}>Terms</Link>
          <Link to={ATTRIBUTION_PATH}>Attribution</Link>
          <Link to={MODERATION_POLICY_PATH}>Moderation</Link>
        </nav>
      </footer>
      <UsernameOnboarding />
      <AchievementUnlockHost />
      <DevToolsLauncher />
      <PreferencesModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        taste={taste}
        onTasteChange={onTasteChange}
      />
    </div>
  )
}

/** Simple gear icon (Heroicons-style cog). */
function SettingsCogIcon() {
  return (
    <svg className="site-icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  )
}

/** Coffee cup icon for the Ko-fi support link. */
function KofiCupIcon() {
  return (
    <svg className="site-icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 9.5h11.25v5.75a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-3.5-3.5V9.5Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9.5h1.5a2.75 2.75 0 0 1 0 5.5h-1.5"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        d="M8 6.25c.35-.7.35-1.4 0-2.1M11.25 6.25c.35-.7.35-1.4 0-2.1"
      />
    </svg>
  )
}
