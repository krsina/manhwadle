import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  AVATAR_BUST_CROPS_EVENT,
  avatarBustCropStyle,
} from '../lib/avatarBustCrop'
import {
  avatarAssetUrl,
  describeAvatar,
  normalizeEquippedAvatarId,
} from '../lib/avatarComposition'
import { snapPixelArtScale } from '../lib/pixelArtScale'

type PixelAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Whole-character Style A avatar plate.
 * `sm` uses a zoomed bust crop toward the head.
 *
 * Optional `snapCrisp` measures the laid-out box and locks width/height to an exact
 * integer scale from the 256 plate (avoids muddy in-between CSS sizes).
 */
export function PixelAvatar({
  characterId,
  size = 'md',
  className = '',
  decorative = false,
  style,
  snapCrisp = false,
}: {
  characterId?: string | null
  size?: PixelAvatarSize
  className?: string
  decorative?: boolean
  /** Optional box size override (e.g. showcase stage fill). */
  style?: CSSProperties
  /** Lock display size to an exact NN scale from the 256 plate. */
  snapCrisp?: boolean
}) {
  const safeId = normalizeEquippedAvatarId(characterId)
  const bust = size === 'sm'
  const label = describeAvatar(safeId)

  const rootRef = useRef<HTMLDivElement>(null)
  const [snapStyle, setSnapStyle] = useState<CSSProperties | undefined>(undefined)
  const [bustTick, setBustTick] = useState(0)

  useEffect(() => {
    if (!bust) return
    function onChange() {
      setBustTick((n) => n + 1)
    }
    window.addEventListener(AVATAR_BUST_CROPS_EVENT, onChange)
    return () => window.removeEventListener(AVATAR_BUST_CROPS_EVENT, onChange)
  }, [bust])

  useEffect(() => {
    if (!snapCrisp) {
      setSnapStyle(undefined)
      return
    }
    const root = rootRef.current
    if (!root || typeof window === 'undefined') return

    const parent = root.parentElement
    if (!parent) return

    function measure() {
      if (!parent) return
      const { width, height } = parent.getBoundingClientRect()
      const available = Math.min(width, height)
      if (available < 2) return
      const dpr = window.devicePixelRatio || 1
      const { cssPx } = snapPixelArtScale(available, dpr)
      const side = Math.min(cssPx, available)
      setSnapStyle((prev) => {
        const next = {
          width: side,
          height: side,
          maxWidth: '100%',
          maxHeight: '100%',
        }
        if (
          prev &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev
        }
        return next
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [snapCrisp])

  const bustStyle = bust
    ? (avatarBustCropStyle(safeId) as CSSProperties)
    : undefined
  void bustTick
  const mergedStyle =
    snapStyle || style || bustStyle
      ? { ...bustStyle, ...style, ...snapStyle }
      : undefined

  return (
    <div
      ref={rootRef}
      className={[
        'pixel-avatar',
        `pixel-avatar-${size}`,
        bust ? 'is-bust' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={mergedStyle}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    >
      <img
        className="pixel-avatar-img"
        src={avatarAssetUrl(safeId)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </div>
  )
}
