import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  installStaleAssetReloadHandlers,
  isStaleAssetError,
  reloadForStaleAssets,
} from './staleAssetReload'

function mockSessionStorage() {
  const store = new Map<string, string>()
  const api = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  vi.stubGlobal('sessionStorage', api)
  return api
}

describe('isStaleAssetError', () => {
  it('detects common chunk/module load failures', () => {
    expect(
      isStaleAssetError(
        new Error(
          'Failed to fetch dynamically imported module: https://manhwadle.net/assets/PlayPage-Zt2cz41p.js',
        ),
      ),
    ).toBe(true)
    expect(
      isStaleAssetError(new Error('Importing a module script failed.')),
    ).toBe(true)
    expect(isStaleAssetError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(
      true,
    )
    expect(isStaleAssetError(new Error('Network request failed'))).toBe(false)
  })
})

describe('reloadForStaleAssets', () => {
  const reload = vi.fn()

  beforeEach(() => {
    mockSessionStorage()
    vi.stubGlobal('window', {
      location: { reload },
      addEventListener: vi.fn(),
    })
    reload.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reloads once then cools down', () => {
    expect(reloadForStaleAssets('test')).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadForStaleAssets('test')).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('installStaleAssetReloadHandlers', () => {
  const reload = vi.fn()
  const listeners = new Map<string, EventListener>()

  beforeEach(() => {
    mockSessionStorage()
    listeners.clear()
    reload.mockClear()
    vi.stubGlobal('window', {
      location: { reload },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reloads on vite preload errors', () => {
    installStaleAssetReloadHandlers()
    const handler = listeners.get('vite:preloadError')
    expect(handler).toBeTypeOf('function')
    const event = {
      preventDefault: vi.fn(),
    } as unknown as Event
    handler?.(event)
    expect((event as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
