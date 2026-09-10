import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Provider, Session, User } from '@supabase/supabase-js'
import type { ReaderTaste } from '../lib/readerTaste'
import { isAccountSetupComplete } from '../lib/accountSetup'
import { OWNER_USER_MODE_EVENT, setOwnerUserModeEnabled, syncOwnerDevSession } from '../lib/devAccess'
import {
  applyLocalOwnerPreview,
  getLocalOwnerUser,
  isLocalOwnerPreviewActive,
} from '../lib/localOwnerPreview'
import {
  changeUsername as apiChangeUsername,
  claimUsername as apiClaimUsername,
  fetchMyAccount,
  updateMySettings as apiUpdateMySettings,
  type AccountSnapshot,
} from '../lib/profileApi'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { mergeLocalAndRemoteOnSignIn } from '../lib/sync'
import { POINTS_AWARDED_EVENT } from '../lib/ranked'
import { recordDailyVisit } from '../lib/leaderboardApi'
import { notifyAchievementsChanged } from '../lib/achievementUnlocks'
import {
  consumePendingReauth,
  markPendingReauth,
  reportSecretEvent,
  DIALOG_ESCAPE_EVENT,
} from '../lib/secretEvents'

export type AuthOAuthProvider = Extract<Provider, 'google' | 'discord'>

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  account: AccountSnapshot | null
  accountLoading: boolean
  needsUsername: boolean
  refreshAccount: () => Promise<AccountSnapshot | null>
  claimUsername: (username: string) => Promise<{ error: string | null }>
  changeUsername: (username: string) => Promise<{ error: string | null; nextChangeAt?: string | null }>
  updateSettings: (input: {
    readerTaste?: ReaderTaste | null
  }) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: AuthOAuthProvider) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function authRedirectTo(): string {
  return window.location.origin
}

export function AuthProvider({
  children,
  onSyncedTaste,
}: {
  children: ReactNode
  onSyncedTaste?: (taste: ReaderTaste) => void
}) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(configured)
  const [account, setAccount] = useState<AccountSnapshot | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const needsUsername = Boolean(session?.user && account?.needsUsername)
  const accountSetupComplete = isAccountSetupComplete(
    Boolean(session?.user),
    accountLoading,
    account,
  )
  const onSyncedTasteRef = useRef(onSyncedTaste)
  onSyncedTasteRef.current = onSyncedTaste
  /** Avoid double merge from getSession + SIGNED_IN for the same user. */
  const lastMergedUserIdRef = useRef<string | null>(null)
  const mergeInFlightRef = useRef<Promise<void> | null>(null)

  async function refreshAccount(): Promise<AccountSnapshot | null> {
    if (!supabase) {
      const local = applyLocalOwnerPreview(null)
      setAccount(local)
      syncOwnerDevSession(local?.staffRole ?? null)
      return local
    }
    setAccountLoading(true)
    try {
      const next = applyLocalOwnerPreview(await fetchMyAccount())
      setAccount(next)
      syncOwnerDevSession(next?.staffRole ?? null)
      return next
    } finally {
      setAccountLoading(false)
    }
  }

  useEffect(() => {
    syncOwnerDevSession(account?.staffRole ?? null)
  }, [account?.staffRole])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (isLocalOwnerPreviewActive()) {
      syncOwnerDevSession('owner')
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      if (isLocalOwnerPreviewActive()) {
        const local = applyLocalOwnerPreview(null)
        setAccount(local)
        syncOwnerDevSession(local?.staffRole ?? null)
      }
      setLoading(false)
      return
    }

    let cancelled = false

    async function syncUser(userId: string) {
      if (lastMergedUserIdRef.current === userId) return
      if (mergeInFlightRef.current) {
        await mergeInFlightRef.current
        if (lastMergedUserIdRef.current === userId) return
      }

      const run = (async () => {
        lastMergedUserIdRef.current = userId
        try {
          const taste = await mergeLocalAndRemoteOnSignIn(userId)
          if (!cancelled && taste) onSyncedTasteRef.current?.(taste)
          if (!cancelled) {
            await refreshAccount()
            // Early Bird (and other hydrate-side hush) may grant inside get_my_account.
            notifyAchievementsChanged()
          }
        } catch (err) {
          lastMergedUserIdRef.current = null
          setAccountLoading(false)
          console.warn('[auth] merge on sign-in failed:', err)
        }
      })()

      mergeInFlightRef.current = run
      try {
        await run
      } finally {
        if (mergeInFlightRef.current === run) mergeInFlightRef.current = null
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session?.user) {
        // Keep owner-dev routes from treating a signed-in owner as a guest
        // while merge + get_my_account are still in flight.
        setAccountLoading(true)
        setLoading(false)
        void syncUser(data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        lastMergedUserIdRef.current = null
        setAccount(null)
        setAccountLoading(false)
        syncOwnerDevSession(null)
        markPendingReauth()
        return
      }
      if (event === 'SIGNED_IN' && next?.user) {
        // Magic-link redirects often emit getSession + SIGNED_IN together.
        // Avoid flipping accountLoading again when sync already owns this user;
        // that remount race can leave the username dialog inert/unfocusable.
        if (lastMergedUserIdRef.current !== next.user.id && !mergeInFlightRef.current) {
          setAccountLoading(true)
        }
        void syncUser(next.user.id)
        if (consumePendingReauth()) {
          void reportSecretEvent('reauth')
        }
      }
    })

    function onPointsAwarded() {
      void refreshAccount()
    }
    function onDialogEscape() {
      void reportSecretEvent('escape_modal')
    }
    window.addEventListener(POINTS_AWARDED_EVENT, onPointsAwarded)
    window.addEventListener(DIALOG_ESCAPE_EVENT, onDialogEscape)

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      window.removeEventListener(POINTS_AWARDED_EVENT, onPointsAwarded)
      window.removeEventListener(DIALOG_ESCAPE_EVENT, onDialogEscape)
    }
  }, [])

  // Ping visit milestones once per session user (server is idempotent per UTC day).
  useEffect(() => {
    // Account setup is a distinct first step. Starting visit awards while the
    // blocking username dialog is open can stack an achievement dialog over it.
    if (!configured || !accountSetupComplete) return
    let cancelled = false
    void recordDailyVisit().then((result) => {
      if (cancelled || !result.ok || !result.recorded) return
      void refreshAccount()
      notifyAchievementsChanged()
    })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, configured, accountSetupComplete])

  async function signInWithMagicLink(email: string) {
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authRedirectTo(),
      },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithOAuth(provider: AuthOAuthProvider) {
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectTo(),
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (!supabase) {
      // Local owner preview: flip into user mode so the guest UI is visible.
      if (import.meta.env.DEV) setOwnerUserModeEnabled(true)
      setAccount(null)
      syncOwnerDevSession(null)
      return
    }
    lastMergedUserIdRef.current = null
    setAccount(null)
    syncOwnerDevSession(null)
    markPendingReauth()
    if (import.meta.env.DEV && !session) {
      setOwnerUserModeEnabled(true)
      return
    }
    await supabase.auth.signOut()
  }

  async function claimUsername(username: string) {
    const result = await apiClaimUsername(username)
    if (!result.ok) return { error: result.error }
    await refreshAccount()
    // Let achievements hydrate only after the username dialog has completed.
    notifyAchievementsChanged()
    return { error: null }
  }

  async function changeUsername(username: string) {
    const result = await apiChangeUsername(username)
    if (!result.ok) {
      return { error: result.error, nextChangeAt: result.nextChangeAt }
    }
    await refreshAccount()
    notifyAchievementsChanged()
    return { error: null, nextChangeAt: result.nextChangeAt }
  }

  async function updateSettings(input: {
    readerTaste?: ReaderTaste | null
  }) {
    const result = await apiUpdateMySettings(input)
    if (!result.ok) return { error: result.error }
    await refreshAccount()
    return { error: null }
  }

  const [ownerPreviewTick, setOwnerPreviewTick] = useState(0)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onUserModeChange() {
      setOwnerPreviewTick((n) => n + 1)
      syncOwnerDevSession(
        isLocalOwnerPreviewActive() ? 'owner' : (account?.staffRole ?? null),
      )
    }
    window.addEventListener(OWNER_USER_MODE_EVENT, onUserModeChange)
    return () => window.removeEventListener(OWNER_USER_MODE_EVENT, onUserModeChange)
  }, [account?.staffRole])

  const localOwnerActive = isLocalOwnerPreviewActive()
  void ownerPreviewTick
  const effectiveUser = session?.user ?? (localOwnerActive ? getLocalOwnerUser() : null)
  const effectiveAccount = localOwnerActive
    ? applyLocalOwnerPreview(account)
    : account

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        session,
        loading,
        configured: configured || localOwnerActive,
        account: effectiveAccount,
        accountLoading,
        needsUsername: localOwnerActive ? false : needsUsername,
        refreshAccount,
        claimUsername,
        changeUsername,
        updateSettings,
        signInWithMagicLink,
        signInWithOAuth,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
