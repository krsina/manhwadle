import { afterEach, describe, expect, it } from 'vitest'
import {
  canShowOwnerUserModeToggle,
  canUseOwnerDevUi,
  isOwnerDevSessionActive,
  isOwnerUserModeEnabled,
  resetOwnerUserModeCacheForTests,
  setOwnerUserModeEnabled,
  syncOwnerDevSession,
} from './devAccess'

describe('devAccess', () => {
  afterEach(() => {
    setOwnerUserModeEnabled(false)
    resetOwnerUserModeCacheForTests()
    try {
      localStorage.removeItem('manhwadle:owner-user-mode')
    } catch {
      /* ignore */
    }
  })

  it('allows owner only (and only in Vite DEV builds)', () => {
    expect(canUseOwnerDevUi('owner')).toBe(Boolean(import.meta.env.DEV))
    expect(canUseOwnerDevUi('moderator')).toBe(false)
    expect(canUseOwnerDevUi(null)).toBe(false)
    expect(canUseOwnerDevUi(undefined)).toBe(false)
  })

  it('shows the user-mode toggle for owners in DEV', () => {
    expect(canShowOwnerUserModeToggle('owner')).toBe(Boolean(import.meta.env.DEV))
    expect(canShowOwnerUserModeToggle('moderator')).toBe(false)
  })

  it('tracks owner DEV session for localStorage override helpers', () => {
    expect(isOwnerDevSessionActive()).toBe(false)
    syncOwnerDevSession('owner')
    expect(isOwnerDevSessionActive()).toBe(Boolean(import.meta.env.DEV))
    syncOwnerDevSession('moderator')
    expect(isOwnerDevSessionActive()).toBe(false)
  })

  it('disables owner DEV UI while user mode is on', () => {
    if (!import.meta.env.DEV) return
    syncOwnerDevSession('owner')
    expect(canUseOwnerDevUi('owner')).toBe(true)
    expect(isOwnerDevSessionActive()).toBe(true)

    setOwnerUserModeEnabled(true)
    expect(isOwnerUserModeEnabled()).toBe(true)
    expect(canUseOwnerDevUi('owner')).toBe(false)
    expect(isOwnerDevSessionActive()).toBe(false)
    expect(canShowOwnerUserModeToggle('owner')).toBe(true)

    setOwnerUserModeEnabled(false)
    expect(canUseOwnerDevUi('owner')).toBe(true)
    expect(isOwnerDevSessionActive()).toBe(true)
  })
})
