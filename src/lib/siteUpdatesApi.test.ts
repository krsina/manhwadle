import { describe, expect, it } from 'vitest'
import {
  formatUpdateDate,
  parseSiteUpdate,
  splitUpdateBody,
} from './siteUpdatesApi'
import { updatesPath } from './routes'

describe('parseSiteUpdate', () => {
  it('parses a valid row', () => {
    const parsed = parseSiteUpdate({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'shop-rebalance',
      title: 'Shop rebalance',
      body: 'Prices adjusted.',
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
      version: '0.2.0',
      published: true,
      publishedAt: '2026-07-29T12:00:00Z',
      createdAt: '2026-07-29T11:00:00Z',
      updatedAt: '2026-07-29T12:00:00Z',
    })
  })

  it('rejects incomplete rows', () => {
    expect(parseSiteUpdate({ slug: 'x' })).toBeNull()
  })
})

describe('splitUpdateBody', () => {
  it('splits on blank lines', () => {
    expect(splitUpdateBody('One\n\nTwo\n\nThree')).toEqual(['One', 'Two', 'Three'])
  })
})

describe('updatesPath', () => {
  it('builds list and detail paths', () => {
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
