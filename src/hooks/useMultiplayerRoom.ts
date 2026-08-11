import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getMultiplayerState } from '../lib/multiplayerApi'
import { supabase } from '../lib/supabase'
import type {
  MultiplayerRpcFailure,
  MultiplayerRoomStatus,
  MultiplayerStateSnapshot,
} from '../lib/multiplayerTypes'

export const MULTIPLAYER_FALLBACK_POLL_MS = 15_000
export const MULTIPLAYER_ACTIVE_POLL_MS = 3_000
export const MULTIPLAYER_TERMINAL_POLL_MS = 60_000

export function isActiveMultiplayerPhase(
  status: MultiplayerRoomStatus | null | undefined,
): boolean {
  return (
    status === 'countdown' ||
    status === 'active' ||
    status === 'intermission'
  )
}

export function multiplayerPollingInterval(
  status: MultiplayerRoomStatus | null | undefined,
  overrideMs?: number,
): number {
  if (overrideMs !== undefined) return Math.max(0, Math.floor(overrideMs))
  if (isActiveMultiplayerPhase(status)) return MULTIPLAYER_ACTIVE_POLL_MS
  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return MULTIPLAYER_TERMINAL_POLL_MS
  }
  return MULTIPLAYER_FALLBACK_POLL_MS
}

export function shouldRefreshOnRealtimeStatus(status: string): boolean {
  return status === 'SUBSCRIBED'
}

export function isPermanentMultiplayerRoomError(
  error: string | null | undefined,
): boolean {
  return (
    error === 'room_not_found' ||
    error === 'member_inactive' ||
    error === 'not_room_member'
  )
}

export interface UseMultiplayerRoomOptions {
  enabled?: boolean
  pollingIntervalMs?: number
}

export interface UseMultiplayerRoomResult {
  state: MultiplayerStateSnapshot | null
  loading: boolean
  refreshing: boolean
  error: MultiplayerRpcFailure | null
  realtimeConnected: boolean
  refresh: () => Promise<MultiplayerStateSnapshot | null>
}

/**
 * Keeps an authoritative multiplayer snapshot current. Realtime payloads are
 * deliberately ignored and used only to invalidate/refetch server state.
 */
export function useMultiplayerRoom(
  roomId: string | null | undefined,
  options: UseMultiplayerRoomOptions = {},
): UseMultiplayerRoomResult {
  const enabled = options.enabled ?? true
  const [state, setState] = useState<MultiplayerStateSnapshot | null>(null)
  const [loading, setLoading] = useState(Boolean(enabled && roomId))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<MultiplayerRpcFailure | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const mountedRef = useRef(true)
  const requestGenerationRef = useRef(0)
  const inFlightRef = useRef<Promise<MultiplayerStateSnapshot | null> | null>(
    null,
  )
  const permanentError = isPermanentMultiplayerRoomError(error?.error)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback((): Promise<MultiplayerStateSnapshot | null> => {
    if (!enabled || !roomId) return Promise.resolve(null)
    if (inFlightRef.current) return inFlightRef.current

    const generation = requestGenerationRef.current
    setRefreshing(true)
    const request = getMultiplayerState(roomId)
      .then((result) => {
        if (!mountedRef.current || generation !== requestGenerationRef.current) {
          return null
        }
        if (result.ok) {
          setState(result.state)
          setError(null)
          return result.state
        }
        setError(result)
        return null
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) {
          inFlightRef.current = null
          if (mountedRef.current) {
            setLoading(false)
            setRefreshing(false)
          }
        }
      })

    inFlightRef.current = request
    return request
  }, [enabled, roomId])

  useEffect(() => {
    requestGenerationRef.current += 1
    inFlightRef.current = null
    setState(null)
    setError(null)
    setRealtimeConnected(false)
    setLoading(Boolean(enabled && roomId))
    setRefreshing(false)
    if (enabled && roomId) void refresh()
  }, [enabled, roomId, refresh])

  useEffect(() => {
    const client = supabase
    if (!enabled || !roomId || !client || permanentError) return
    let disposed = false
    let channel: RealtimeChannel | null = null

    void client.realtime
      .setAuth()
      .then(() => {
        if (disposed) return
        channel = client
          .channel(`multiplayer:${roomId}`, {
            config: { private: true },
          })
          .on('broadcast', { event: '*' }, () => {
            void refresh()
          })
          .subscribe((status) => {
            if (disposed) return
            setRealtimeConnected(status === 'SUBSCRIBED')
            if (shouldRefreshOnRealtimeStatus(status)) void refresh()
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setRealtimeConnected(false)
            }
          })
      })
      .catch(() => {
        if (!disposed) setRealtimeConnected(false)
      })

    return () => {
      disposed = true
      setRealtimeConnected(false)
      if (channel) void client.removeChannel(channel)
    }
  }, [enabled, permanentError, refresh, roomId])

  useEffect(() => {
    if (
      !enabled ||
      !roomId ||
      permanentError ||
      typeof window === 'undefined'
    ) return

    const pollingIntervalMs = multiplayerPollingInterval(
      state?.room.status,
      options.pollingIntervalMs,
    )
    const onFocus = () => {
      void refresh()
    }
    const onOnline = () => {
      void refresh()
    }
    const interval =
      pollingIntervalMs > 0
        ? window.setInterval(() => {
            void refresh()
          }, pollingIntervalMs)
        : null

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      if (interval !== null) window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [
    enabled,
    options.pollingIntervalMs,
    permanentError,
    refresh,
    roomId,
    state?.room.status,
  ])

  return {
    state,
    loading,
    refreshing,
    error,
    realtimeConnected,
    refresh,
  }
}
