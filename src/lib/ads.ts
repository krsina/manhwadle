/**
 * Display + rewarded ad configuration.
 * Primary display: AdSense. Fallback banners + rewarded: Adsterra.
 * See docs/ads.md.
 */

export type AdsProvider = 'adsense' | 'adsterra' | 'none'

export type RenderableAdSlotId = 'rail_left' | 'rail_right' | 'bottom'

export interface AdsterraBannerConfig {
  key: string
  width: number
  height: number
  invokeHost: string
}

export interface AdSenseSlotConfig {
  clientId: string
  slotId: string
  width: number
  height: number
}

const SLOT_DEFAULTS: Record<
  RenderableAdSlotId,
  { defaultWidth: number; defaultHeight: number }
> = {
  rail_left: { defaultWidth: 160, defaultHeight: 600 },
  rail_right: { defaultWidth: 160, defaultHeight: 600 },
  bottom: { defaultWidth: 728, defaultHeight: 90 },
}

function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = readEnv(name)
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getAdsProvider(): AdsProvider {
  const raw = readEnv('VITE_ADS_PROVIDER').toLowerCase()
  if (raw === 'adsense' || raw === 'adsterra') return raw
  return 'none'
}

export function isAdsMasterEnabled(): boolean {
  const flag = readEnv('VITE_ADS_ENABLED').toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

export function getAdSenseClientId(): string {
  return readEnv('VITE_ADSENSE_CLIENT_ID')
}

export function getAdsterraInvokeHost(): string {
  return readEnv('VITE_ADSTERRA_INVOKE_HOST') || 'www.highperformanceformat.com'
}

function slotEnvPrefix(slotId: RenderableAdSlotId): string {
  if (slotId === 'rail_left') return 'RAIL_LEFT'
  if (slotId === 'rail_right') return 'RAIL_RIGHT'
  return 'BOTTOM'
}

export function getAdSenseSlotConfig(
  slotId: RenderableAdSlotId,
): AdSenseSlotConfig | null {
  const clientId = getAdSenseClientId()
  if (!clientId) return null
  const prefix = slotEnvPrefix(slotId)
  const adSlot = readEnv(`VITE_ADSENSE_${prefix}_SLOT`)
  if (!adSlot) return null
  const defaults = SLOT_DEFAULTS[slotId]
  return {
    clientId,
    slotId: adSlot,
    width: readPositiveInt(`VITE_ADSENSE_${prefix}_WIDTH`, defaults.defaultWidth),
    height: readPositiveInt(`VITE_ADSENSE_${prefix}_HEIGHT`, defaults.defaultHeight),
  }
}

export function getAdsterraBannerConfig(
  slotId: RenderableAdSlotId,
): AdsterraBannerConfig | null {
  const prefix = slotEnvPrefix(slotId)
  const key = readEnv(`VITE_ADSTERRA_${prefix}_KEY`)
  if (!key) return null
  const defaults = SLOT_DEFAULTS[slotId]
  return {
    key,
    width: readPositiveInt(`VITE_ADSTERRA_${prefix}_WIDTH`, defaults.defaultWidth),
    height: readPositiveInt(`VITE_ADSTERRA_${prefix}_HEIGHT`, defaults.defaultHeight),
    invokeHost: getAdsterraInvokeHost(),
  }
}

export function isAdSlotConfigured(slotId: RenderableAdSlotId): boolean {
  if (!isAdsMasterEnabled()) return false
  const provider = getAdsProvider()
  if (provider === 'adsense') return getAdSenseSlotConfig(slotId) != null
  if (provider === 'adsterra') return getAdsterraBannerConfig(slotId) != null
  return false
}

/** True when any display slot could render. */
export function areAdsConfigured(): boolean {
  if (!isAdsMasterEnabled()) return false
  return (
    isAdSlotConfigured('rail_left') ||
    isAdSlotConfigured('rail_right') ||
    isAdSlotConfigured('bottom')
  )
}

export function isRewardedAdsConfigured(): boolean {
  if (!isAdsMasterEnabled()) return false
  return Boolean(readEnv('VITE_ADSTERRA_REWARDED_KEY'))
}

export function getAdsterraRewardedKey(): string {
  return readEnv('VITE_ADSTERRA_REWARDED_KEY')
}

export function getRewardedPointsAmount(): number {
  return readPositiveInt('VITE_REWARDED_AD_POINTS', 15)
}

/** Build srcdoc HTML for an isolated Adsterra iframe banner (no popunders). */
export function buildAdsterraBannerSrcDoc(config: AdsterraBannerConfig): string {
  const host = config.invokeHost.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const keyJson = JSON.stringify(config.key)
  const width = config.width
  const height = config.height
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;}</style></head><body><script>atOptions={key:${keyJson},format:'iframe',height:${height},width:${width},params:{}};</script><script src="https://${host}/${config.key}/invoke.js"><\/script></body></html>`
}
