import { describe, expect, it } from 'vitest'
import {
  legacyPlayRedirectTarget,
  parsePlayModeParam,
  playPath,
  readLegacyModeId,
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
