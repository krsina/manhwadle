import { describe, expect, it } from 'vitest'
import {
  buildAdsterraBannerSrcDoc,
  getAdsProvider,
  isAdsMasterEnabled,
} from './ads'

describe('ads config helpers', () => {
  it('defaults to ads off when env is unset', () => {
    expect(isAdsMasterEnabled()).toBe(false)
    expect(getAdsProvider()).toBe('none')
  })

  it('builds an Adsterra banner srcdoc with the invoke script', () => {
    const html = buildAdsterraBannerSrcDoc({
      key: 'abc123',
      width: 160,
      height: 600,
      invokeHost: 'www.highperformanceformat.com',
    })
    expect(html).toContain('key:"abc123"')
    expect(html).toContain('width:160')
    expect(html).toContain('height:600')
    expect(html).toContain(
      'https://www.highperformanceformat.com/abc123/invoke.js',
    )
    expect(html).not.toContain('popunder')
  })
})
