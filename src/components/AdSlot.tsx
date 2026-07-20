import { useEffect, useRef } from 'react'
import {
  buildAdsterraBannerSrcDoc,
  getAdsProvider,
  getAdSenseSlotConfig,
  getAdsterraBannerConfig,
  isAdSlotConfigured,
  type RenderableAdSlotId,
} from '../lib/ads'

interface AdSlotProps {
  slotId: RenderableAdSlotId
  className?: string
  label?: string
}

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * Display banner slot (AdSense or Adsterra).
 * Renders when ads are env-configured.
 */
export function AdSlot({
  slotId,
  className,
  label = 'Advertisement',
}: AdSlotProps) {
  const adsensePushed = useRef(false)

  useEffect(() => {
    if (!isAdSlotConfigured(slotId)) return
    if (getAdsProvider() !== 'adsense') return
    const config = getAdSenseSlotConfig(slotId)
    if (!config || adsensePushed.current) return

    const clientId = config.clientId
    const existing = document.querySelector(
      `script[data-manhwadle-adsense="${clientId}"]`,
    )
    function push() {
      if (adsensePushed.current) return
      adsensePushed.current = true
      try {
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      } catch {
        /* ignore */
      }
    }
    if (existing) {
      push()
      return
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`
    script.crossOrigin = 'anonymous'
    script.dataset.manhwadleAdsense = clientId
    script.onload = () => push()
    document.head.appendChild(script)
  }, [slotId])

  if (!isAdSlotConfigured(slotId)) return null

  const provider = getAdsProvider()

  if (provider === 'adsense') {
    const config = getAdSenseSlotConfig(slotId)
    if (!config) return null
    return (
      <aside
        className={['ad-slot', className].filter(Boolean).join(' ')}
        aria-label={label}
        data-ad-slot={slotId}
      >
        <ins
          className="adsbygoogle ad-slot-adsense"
          style={{
            display: 'inline-block',
            width: `${config.width}px`,
            height: `${config.height}px`,
          }}
          data-ad-client={config.clientId}
          data-ad-slot={config.slotId}
        />
      </aside>
    )
  }

  if (provider === 'adsterra') {
    const config = getAdsterraBannerConfig(slotId)
    if (!config) return null
    const srcDoc = buildAdsterraBannerSrcDoc(config)
    return (
      <aside
        className={['ad-slot', className].filter(Boolean).join(' ')}
        aria-label={label}
        data-ad-slot={slotId}
      >
        <iframe
          className="ad-slot-frame"
          title={label}
          width={config.width}
          height={config.height}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </aside>
    )
  }

  return null
}
