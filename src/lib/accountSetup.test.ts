import { describe, expect, it } from 'vitest'
import type { AccountSnapshot } from './profileApi'
import { isAccountSetupComplete } from './accountSetup'

const readyAccount = {
  needsUsername: false,
} as AccountSnapshot

describe('account setup sequencing', () => {
  it('waits while authentication or the account request is loading', () => {
    expect(isAccountSetupComplete(false, false, null)).toBe(false)
    expect(isAccountSetupComplete(true, true, readyAccount)).toBe(false)
  })

  it('waits when the account snapshot is unavailable', () => {
    expect(isAccountSetupComplete(true, false, null)).toBe(false)
  })

  it('keeps achievements blocked until username setup is complete', () => {
    expect(
      isAccountSetupComplete(true, false, {
        ...readyAccount,
        needsUsername: true,
      }),
    ).toBe(false)
    expect(isAccountSetupComplete(true, false, readyAccount)).toBe(true)
  })
})
