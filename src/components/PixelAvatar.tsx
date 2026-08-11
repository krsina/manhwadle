import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  resolveAvatarPresentation,
  type AwakeningLevel,
} from '../lib/avatarAwakening'
import {
  AVATAR_BUST_CROPS_EVENT,
  avatarBustCropStyle,
} from '../lib/avatarBustCrop'
import { describeAvatar, normalizeEquippedAvatarId } from '../lib/avatarComposition'
import { snapPixelArtScale } from '../lib/pixelArtScale'

type PixelAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Whole-character Style A avatar: static PNG, or a registered Awakening idle sprite sheet.
 * Sheets advance in-place via JS frame index + translateX (reliable, not CSS keyframes).
 * `sm` uses a zoomed bust crop toward the head and stays static for perf.
 *
 * Optional `snapCrisp` measures the laid-out box and locks width/height to an exact
 * integer scale from the 256 plate (avoids muddy in-between CSS sizes).
 */
export function PixelAvatar({
  characterId,
  size = 'md',
  className = '',
  decorative = false,
  awakeningLevel = 0,
  style,
  snapCrisp = false,
}: {
  characterId?: string | null
  size?: PixelAvatarSize
  className?: string
  decorative?: boolean
  /** Owned awakening tier for this character. Ignored for `sm` busts. */
  awakeningLevel?: AwakeningLevel | number | null
  /** Optional box size override (e.g. showcase stage fill). */
  style?: CSSProperties
  /** Lock display size to an exact NN scale from the 256 plate. */
  snapCrisp?: boolean
}) {
  const safeId = normalizeEquippedAvatarId(characterId)
  const bust = size === 'sm'
  const presentation = resolveAvatarPresentation(
    safeId,
    bust ? 0 : awakeningLevel,
  )
  const label = describeAvatar(safeId)
  const level = presentation.awakeningLevel
  const frames = presentation.frameCount
  const useSheet = presentation.useSpriteSheet && frames > 1

  const rootRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState(0)
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
    setFrame(0)
    if (!useSheet) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const ms = 220
    const id = window.setInterval(() => {
      setFrame((n) => (n + 1) % frames)
    }, ms)
    return () => window.clearInterval(id)
  }, [useSheet, frames, presentation.src])

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

  const stripStyle = useSheet
    ? ({
        width: `${frames * 100}%`,
        transform: `translateX(-${(frame / frames) * 100}%)`,
      } as CSSProperties)
    : undefined

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
        level > 0 ? `is-awakened is-awakening-${level}` : '',
        useSheet ? 'is-sprite-sheet' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-awakening={level}
      data-sheet-frames={useSheet ? frames : undefined}
      data-sheet-frame={useSheet ? frame : undefined}
      style={mergedStyle}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    >
      {useSheet ? (
        <span className="pixel-avatar-sheet-window" aria-hidden="true">
          <img
            className="pixel-avatar-sheet-strip"
            src={presentation.src}
            alt=""
            draggable={false}
            style={stripStyle}
          />
        </span>
      ) : (
        <img
          className="pixel-avatar-img"
          src={presentation.src}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
    </div>
  )
}
