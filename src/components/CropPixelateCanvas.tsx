import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import { MediaImage } from './MediaImage'

interface CropPixelateCanvasProps {
  src: string
  alt: string
  fallbackLabel?: string
  /** CSS zoom scale (1 = full frame). */
  zoomScale: number
  focusX: number
  focusY: number
  /**
   * Mosaic block size in CSS pixels of the frame.
   * 1 (or less) skips canvas and renders a normal zoomed image.
   */
  pixelSize: number
  grayscale?: boolean
  className?: string
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']
}

/**
 * Draw object-fit:cover, then scale around a %-origin (matches .crop-zoom).
 */
function drawCoverZoomed(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  zoom: number,
  focusX: number,
  focusY: number,
) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return

  const cover = Math.max(w / iw, h / ih)
  const dw = iw * cover
  const dh = ih * cover
  const ox = (w - dw) / 2
  const oy = (h - dh) / 2

  ctx.save()
  ctx.translate((w * focusX) / 100, (h * focusY) / 100)
  ctx.scale(zoom, zoom)
  ctx.translate((-w * focusX) / 100, (-h * focusY) / 100)
  ctx.drawImage(img, ox, oy, dw, dh)
  ctx.restore()
}

/**
 * Viewport mosaic for hard mode: zoom first, then pixelate what you see.
 * Canvas downscale/upscale (no getImageData) so cross-origin still paints.
 */
export function CropPixelateCanvas({
  src,
  alt,
  fallbackLabel = 'Image unavailable',
  zoomScale,
  focusX,
  focusY,
  pixelSize,
  grayscale = false,
  className = '',
  referrerPolicy,
}: CropPixelateCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  const useCanvas = pixelSize > 1 && Boolean(src) && !failed

  useEffect(() => {
    if (!useCanvas) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    let cancelled = false
    const img = new Image()
    // Intentionally no crossOrigin — AniList may omit ACAO; we only paint,
    // never read pixels, so a tainted canvas is fine.

    const paint = () => {
      if (cancelled) return
      const w = Math.max(1, Math.round(wrap.clientWidth))
      const h = Math.max(1, Math.round(wrap.clientHeight))
      if (w < 2 || h < 2) return

      const full = document.createElement('canvas')
      full.width = w
      full.height = h
      const fctx = full.getContext('2d')
      if (!fctx) return
      fctx.clearRect(0, 0, w, h)
      if (grayscale) fctx.filter = 'grayscale(1)'
      drawCoverZoomed(fctx, img, w, h, zoomScale, focusX, focusY)
      fctx.filter = 'none'

      const block = Math.max(2, Math.round(pixelSize))
      const pw = Math.max(1, Math.floor(w / block))
      const ph = Math.max(1, Math.floor(h / block))
      const small = document.createElement('canvas')
      small.width = pw
      small.height = ph
      const sctx = small.getContext('2d')
      if (!sctx) return
      sctx.imageSmoothingEnabled = false
      sctx.drawImage(full, 0, 0, pw, ph)

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(small, 0, 0, w, h)
    }

    const onError = () => {
      if (!cancelled) setFailed(true)
    }

    img.addEventListener('load', paint)
    img.addEventListener('error', onError)
    if (referrerPolicy) img.referrerPolicy = referrerPolicy
    img.src = src

    const ro = new ResizeObserver(() => {
      if (img.complete && img.naturalWidth > 0) paint()
    })
    ro.observe(wrap)

    return () => {
      cancelled = true
      img.removeEventListener('load', paint)
      img.removeEventListener('error', onError)
      ro.disconnect()
    }
  }, [
    useCanvas,
    src,
    zoomScale,
    focusX,
    focusY,
    pixelSize,
    grayscale,
    referrerPolicy,
  ])

  if (!useCanvas) {
    return (
      <div
        className="crop-zoom"
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: `${focusX}% ${focusY}%`,
        }}
      >
        <MediaImage
          className={`crop-image${grayscale ? ' is-grayscale' : ''}${className ? ` ${className}` : ''}`}
          src={src}
          alt={alt}
          fallbackLabel={fallbackLabel}
          draggable={false}
          referrerPolicy={referrerPolicy}
        />
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="crop-pixelate-canvas-wrap">
      <canvas
        ref={canvasRef}
        className={`crop-image crop-pixelate-canvas${grayscale ? ' is-grayscale' : ''}${className ? ` ${className}` : ''}`}
        role="img"
        aria-label={alt}
      />
    </div>
  )
}
