import { describe, expect, it, vi } from 'vitest'
import {
  leaveMultiplayerPage,
  multiplayerInteractionsBlocked,
} from './multiplayerPageActions'

describe('leaveMultiplayerPage', () => {
  it('stays in the room when the leave mutation fails', async () => {
    const navigate = vi.fn()

    await expect(
      leaveMultiplayerPage(async () => false, navigate),
    ).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates only after the leave mutation succeeds', async () => {
    const navigate = vi.fn()

    await expect(
      leaveMultiplayerPage(async () => true, navigate),
    ).resolves.toBe(true)
    expect(navigate).toHaveBeenCalledOnce()
  })
})

describe('multiplayerInteractionsBlocked', () => {
  it('blocks mutations while pending or while the snapshot is stale', () => {
    expect(multiplayerInteractionsBlocked(false, null)).toBe(false)
    expect(multiplayerInteractionsBlocked(true, null)).toBe(true)
    expect(multiplayerInteractionsBlocked(false, { error: 'rate_limited' })).toBe(true)
  })
})
