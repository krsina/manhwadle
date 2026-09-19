import { describe, expect, it } from 'vitest'
import {
  DEV_NEW_AVATARS_PATH,
  DEV_NEXT_MODE_PATH,
  DEV_GACHA_SHOP_PATH,
  DEV_VERSUS_EFFECTS_PATH,
  SHOP_COLLECTION_PATH,
  SHOP_PATH,
  legacyPlayRedirectTarget,
  parsePlayModeParam,
  playPath,
  parseLookTab,
  shopLookPath,
  readLegacyModeId,
  STAFF_COMMENTS_PATH,
  versusRoomPath,
} from './routes'

describe('playPath', () => {
  it('builds stable play routes and preserves archive dates', () => {
    expect(playPath('summary')).toBe('/play/summary')
    expect(playPath('character', '2026-07-10')).toBe('/play/character?date=2026-07-10')
    expect(playPath('unknown')).toBe('/play/summary')
  })
})

describe('parsePlayModeParam', () => {
  it('accepts known modes only', () => {
    expect(parsePlayModeParam('cover')).toBe('cover')
    expect(parsePlayModeParam('HEARDLE')).toBe('heardle')
    expect(parsePlayModeParam('nope')).toBeNull()
  })
})

describe('legacyPlayRedirectTarget', () => {
  it('redirects homepage ?mode= and hash links to /play/:mode', () => {
    expect(
      legacyPlayRedirectTarget({
        pathname: '/',
        search: '?mode=character',
        hash: '',
      }),
    ).toBe('/play/character')

    expect(
      legacyPlayRedirectTarget({
        pathname: '/',
        search: '?mode=cover&date=2026-07-01',
        hash: '',
      }),
    ).toBe('/play/cover?date=2026-07-01')

    expect(
      legacyPlayRedirectTarget({
        pathname: '/',
        search: '',
        hash: '#heardle',
      }),
    ).toBe('/play/heardle')
  })

  it('redirects bare /play with optional mode query', () => {
    expect(
      legacyPlayRedirectTarget({
        pathname: '/play',
        search: '',
        hash: '',
      }),
    ).toBe('/play/summary')

    expect(
      legacyPlayRedirectTarget({
        pathname: '/play/',
        search: '?mode=summary&date=2026-06-15',
        hash: '',
      }),
    ).toBe('/play/summary?date=2026-06-15')
  })

  it('leaves clean /play/:mode alone', () => {
    expect(
      legacyPlayRedirectTarget({
        pathname: '/play/summary',
        search: '',
        hash: '',
      }),
    ).toBeNull()
  })
})

describe('readLegacyModeId', () => {
  it('prefers query over hash', () => {
    expect(readLegacyModeId('?mode=cover', '#summary')).toBe('cover')
    expect(readLegacyModeId('', '#character')).toBe('character')
    expect(readLegacyModeId('?mode=nope', '')).toBeNull()
  })
})

describe('staff paths', () => {
  it('keeps comment moderation on its own route', () => {
    expect(STAFF_COMMENTS_PATH).toBe('/staff/comments')
  })
})

describe('shop paths', () => {
  it('keeps collection off the main shop page', () => {
    expect(SHOP_PATH).toBe('/shop')
    expect(SHOP_COLLECTION_PATH).toBe('/shop/collection')
  })

  it('opens character and background tabs from look links', () => {
    expect(shopLookPath()).toBe('/shop')
    expect(shopLookPath({ tab: 'characters' })).toBe('/shop?tab=characters')
    expect(shopLookPath({ tab: 'backgrounds' })).toBe('/shop?tab=backgrounds')
    expect(shopLookPath({ collection: true, tab: 'backgrounds' })).toBe(
      '/shop/collection?tab=backgrounds',
    )
    expect(parseLookTab('backgrounds')).toBe('backgrounds')
    expect(parseLookTab('characters')).toBe('characters')
    expect(parseLookTab(null)).toBe('characters')
  })
})

describe('dev paths', () => {
  it('keeps the Versus effects lab on a stable route', () => {
    expect(DEV_VERSUS_EFFECTS_PATH).toBe('/dev/versus-effects')
  })

  it('keeps the Gacha shop lab on a stable route', () => {
    expect(DEV_GACHA_SHOP_PATH).toBe('/dev/gacha-shop')
  })

  it('keeps the new-avatars gallery on a stable route', () => {
    expect(DEV_NEW_AVATARS_PATH).toBe('/dev/new-avatars')
  })

  it('keeps the next-mode prompt lab on a stable route', () => {
    expect(DEV_NEXT_MODE_PATH).toBe('/dev/next-mode')
  })
})

describe('versusRoomPath', () => {
  it('builds hub and encoded room routes', () => {
    expect(versusRoomPath()).toBe('/versus')
    expect(versusRoomPath('room/with spaces')).toBe('/versus/room%2Fwith%20spaces')
  })
})
