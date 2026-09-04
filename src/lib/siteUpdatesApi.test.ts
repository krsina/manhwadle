import { describe, expect, it } from 'vitest'
import {
  formatUpdateDate,
  parseSiteUpdate,
  sortSiteUpdates,
  splitUpdateBody,
  type SiteUpdate,
} from './siteUpdatesApi'
import { newsPath, updatesPath } from './routes'

describe('parseSiteUpdate', () => {
  it('parses a valid row', () => {
    const parsed = parseSiteUpdate({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'shop-rebalance',
      title: 'Shop rebalance',
      body: 'Prices adjusted.',
      kind: 'update',
      version: '0.2.0',
      published: true,
      published_at: '2026-07-29T12:00:00Z',
      created_at: '2026-07-29T11:00:00Z',
      updated_at: '2026-07-29T12:00:00Z',
    })
    expect(parsed).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'shop-rebalance',
      title: 'Shop rebalance',
      body: 'Prices adjusted.',
      kind: 'update',
      version: '0.2.0',
      published: true,
      sticky: false,
      publishedAt: '2026-07-29T12:00:00Z',
      createdAt: '2026-07-29T11:00:00Z',
      updatedAt: '2026-07-29T12:00:00Z',
    })
  })

  it('rejects incomplete rows', () => {
    expect(parseSiteUpdate({ slug: 'x' })).toBeNull()
  })

  it('parses announcements and rejects unknown kinds', () => {
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'maintenance-window',
      title: 'Maintenance window',
      body: 'A short maintenance window is planned.',
      version: null,
      published: true,
      published_at: '2026-08-11T12:00:00Z',
      created_at: '2026-08-11T11:00:00Z',
      updated_at: '2026-08-11T12:00:00Z',
    }
    expect(parseSiteUpdate({ ...row, kind: 'announcement' })?.kind).toBe('announcement')
    expect(parseSiteUpdate({ ...row, kind: 'other' })).toBeNull()
    expect(parseSiteUpdate(row)?.kind).toBe('update')
    expect(parseSiteUpdate({ ...row, kind: 'announcement' })?.sticky).toBe(false)
    expect(parseSiteUpdate({ ...row, kind: 'announcement', sticky: true })?.sticky).toBe(true)
  })
})

describe('sortSiteUpdates', () => {
  const base: Omit<SiteUpdate, 'id' | 'slug' | 'title' | 'sticky' | 'publishedAt' | 'createdAt'> = {
    body: 'Body',
    kind: 'update',
    version: '1.0.0',
    published: true,
    updatedAt: '2026-09-01T00:00:00Z',
  }

  it('pins sticky posts above newer unpinned posts', () => {
    const newer: SiteUpdate = {
      ...base,
      id: 'newer',
      slug: 'newer',
      title: 'Newer',
      sticky: false,
      publishedAt: '2026-09-04T00:00:00Z',
      createdAt: '2026-09-04T00:00:00Z',
    }
    const pinned: SiteUpdate = {
      ...base,
      id: 'pinned',
      slug: 'pinned',
      title: 'Pinned',
      kind: 'announcement',
      version: null,
      sticky: true,
      publishedAt: '2026-08-11T00:00:00Z',
      createdAt: '2026-08-11T00:00:00Z',
    }
    expect(sortSiteUpdates([newer, pinned]).map((row) => row.slug)).toEqual([
      'pinned',
      'newer',
    ])
  })
})

describe('splitUpdateBody', () => {
  it('splits on blank lines', () => {
    expect(splitUpdateBody('One\n\nTwo\n\nThree')).toEqual(['One', 'Two', 'Three'])
  })
})

describe('news paths', () => {
  it('builds canonical list and detail paths', () => {
    expect(newsPath()).toBe('/news')
    expect(newsPath('shop-rebalance')).toBe('/news/shop-rebalance')
  })

  it('retains legacy update paths for redirects', () => {
    expect(updatesPath()).toBe('/updates')
    expect(updatesPath('shop-rebalance')).toBe('/updates/shop-rebalance')
  })
})

describe('formatUpdateDate', () => {
  it('formats UTC date and time', () => {
    const label = formatUpdateDate('2026-07-29T12:00:00Z')
    expect(label).toMatch(/2026/)
    expect(label).toMatch(/12/)
    expect(label).toMatch(/UTC|GMT/i)
    expect(formatUpdateDate(null)).toBe('')
  })
})
