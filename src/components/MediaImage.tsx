import { useState, type ImgHTMLAttributes } from 'react'

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError'> {
  /** Accessible description; empty string marks decorative. */
  alt: string
  fallbackLabel?: string
}

/**
 * Image with accessible fallback when the remote asset fails to load.
 * Failures never block gameplay — the placeholder keeps layout stable.
 */
export function MediaImage({
  alt,
  fallbackLabel = 'Image unavailable',
  className = '',
  ...rest
}: MediaImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed || !rest.src) {
    return (
      <div
        className={`media-fallback ${className}`.trim()}
        role="img"
        aria-label={alt || fallbackLabel}
      >
        <span className="media-fallback-text">{fallbackLabel}</span>
      </div>
    )
  }

  return (
    <img
      {...rest}
      className={className}
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}
