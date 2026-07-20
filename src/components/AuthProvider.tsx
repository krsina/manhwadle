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
  const onSyncedTasteRef = useRef(onSyncedTaste)
  onSyncedTasteRef.current = onSyncedTaste
  /** Avoid double merge from getSession + SIGNED_IN for the same user. */
  const lastMergedUserIdRef = useRef<string | null>(null)
  const mergeInFlightRef = useRef<Promise<void> | null>(null)

  async function refreshAccount(): Promise<AccountSnapshot | null> {
    if (!supabase) {
      setAccount(null)
      return null
    }
    setAccountLoading(true)
    try {
      const next = await fetchMyAccount()
      setAccount(next)
      return next
    } finally {
      setAccountLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) {
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
          if (!cancelled) await refreshAccount()
        } catch (err) {
          lastMergedUserIdRef.current = null
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
      setLoading(false)
      if (data.session?.user) void syncUser(data.session.user.id)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        lastMergedUserIdRef.current = null
        setAccount(null)
        markPendingReauth()
        return
      }
      if (event === 'SIGNED_IN' && next?.user) {
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
    if (!session?.user || !configured) return
    let cancelled = false
    void recordDailyVisit().then((result) => {
      if (cancelled || !result.ok || !result.recorded) return
      void refreshAccount()
      notifyAchievementsChanged()
    })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, configured])

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
    if (!supabase) return
    lastMergedUserIdRef.current = null
    setAccount(null)
    markPendingReauth()
    await supabase.auth.signOut()
  }

  async function claimUsername(username: string) {
    const result = await apiClaimUsername(username)
    if (!result.ok) return { error: result.error }
    await refreshAccount()
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

  const needsUsername = Boolean(session?.user && account?.needsUsername)

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        configured,
        account,
        accountLoading,
        needsUsername,
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
