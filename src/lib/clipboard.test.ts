import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('copyTextToClipboard', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyTextToClipboard('ABCD2345')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('ABCD2345')
  })

  it('falls back to execCommand when Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const ta = {
      value: '',
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
      select: vi.fn(),
    }
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ta),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand,
    })

    await expect(copyTextToClipboard('ABCD2345')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(ta.value).toBe('ABCD2345')
  })
})
