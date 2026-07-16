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
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { mergeLocalAndRemoteOnSignIn } from '../lib/sync'

export type AuthOAuthProvider = Extract<Provider, 'google' | 'discord'>

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
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
  const onSyncedTasteRef = useRef(onSyncedTaste)
  onSyncedTasteRef.current = onSyncedTaste
  /** Avoid double merge from getSession + SIGNED_IN for the same user. */
  const lastMergedUserIdRef = useRef<string | null>(null)
  const mergeInFlightRef = useRef<Promise<void> | null>(null)

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
        return
      }
      if (event === 'SIGNED_IN' && next?.user) {
        void syncUser(next.user.id)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

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
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        configured,
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
