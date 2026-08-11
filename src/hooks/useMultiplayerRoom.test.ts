import { describe, expect, it } from 'vitest'
import {
  isActiveMultiplayerPhase,
  isPermanentMultiplayerRoomError,
  MULTIPLAYER_ACTIVE_POLL_MS,
  MULTIPLAYER_FALLBACK_POLL_MS,
  multiplayerPollingInterval,
  MULTIPLAYER_TERMINAL_POLL_MS,
  shouldRefreshOnRealtimeStatus,
} from './useMultiplayerRoom'

describe('multiplayer room refresh scheduling', () => {
  it.each(['countdown', 'active', 'intermission'] as const)(
    'treats %s as an active phase',
    (status) => {
      expect(isActiveMultiplayerPhase(status)).toBe(true)
      expect(multiplayerPollingInterval(status)).toBe(
        MULTIPLAYER_ACTIVE_POLL_MS,
      )
    },
  )

  it.each(['completed', 'cancelled', 'expired'] as const)(
    'polls terminal %s rooms less frequently',
    (status) => {
      expect(isActiveMultiplayerPhase(status)).toBe(false)
      expect(multiplayerPollingInterval(status)).toBe(
        MULTIPLAYER_TERMINAL_POLL_MS,
      )
    },
  )

  it('uses fallback lobby timing and respects an explicit override', () => {
    expect(multiplayerPollingInterval('lobby')).toBe(
      MULTIPLAYER_FALLBACK_POLL_MS,
    )
    expect(multiplayerPollingInterval(null)).toBe(
      MULTIPLAYER_FALLBACK_POLL_MS,
    )
    expect(multiplayerPollingInterval('active', 750)).toBe(750)
    expect(multiplayerPollingInterval('active', -1)).toBe(0)
  })

  it('refreshes whenever Realtime establishes or re-establishes a subscription', () => {
    expect(shouldRefreshOnRealtimeStatus('SUBSCRIBED')).toBe(true)
    expect(shouldRefreshOnRealtimeStatus('CHANNEL_ERROR')).toBe(false)
    expect(shouldRefreshOnRealtimeStatus('TIMED_OUT')).toBe(false)
    expect(shouldRefreshOnRealtimeStatus('CLOSED')).toBe(false)
  })

  it('stops background work after permanent room access failures', () => {
    expect(isPermanentMultiplayerRoomError('room_not_found')).toBe(true)
    expect(isPermanentMultiplayerRoomError('member_inactive')).toBe(true)
    expect(isPermanentMultiplayerRoomError('not_room_member')).toBe(true)
    expect(isPermanentMultiplayerRoomError('rate_limited')).toBe(false)
    expect(isPermanentMultiplayerRoomError(null)).toBe(false)
  })
})
