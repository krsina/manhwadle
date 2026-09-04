import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PixelAvatar } from '../PixelAvatar'
import { gachaSpinPool, type GachaRollResult } from '../../lib/gacha'
import { GACHA_CAROUSEL_MS, gachaSpinEase } from '../../lib/gachaMotion'
import {
  beginGachaSpinSound,
  landGachaSpinSound,
  playGachaTickSound,
  stopGachaSpinSound,
} from '../../lib/gachaSounds'

const FILLERS_PER_LOOP = 10
const LOOPS = 6

export function GachaCarousel({
  result,
  playId,
  skip,
  muted = false,
  onLanded,
}: {
  result: GachaRollResult
  playId: number
  skip: boolean
  muted?: boolean
  onLanded: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<(HTMLDivElement | null)[]>([])
  const landedRef = useRef(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onLandedRef = useRef(onLanded)
  onLandedRef.current = onLanded
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'landed'>(skip ? 'landed' : 'spinning')

  const { tiles, targetIndex } = useMemo(() => {
    const others = gachaSpinPool(result.rarity).filter(
      (character) => character.id !== result.character.id,
    )
    const start = others.length === 0 ? 0 : playId % others.length
    const rotated = [...others.slice(start), ...others.slice(0, start)]
    const fillers = rotated.slice(0, FILLERS_PER_LOOP)
    const unit = fillers.length > 0 ? [...fillers, result.character] : [result.character]
    const nextTiles = Array.from({ length: LOOPS }, () => unit).flat()
    const tail = fillers.slice(0, 5)
    nextTiles.push(...tail)
    return { tiles: nextTiles, targetIndex: nextTiles.length - 1 - tail.length }
  }, [playId, result.character, result.rarity])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const tile = tileRefs.current[targetIndex]
    if (!viewport || !track || !tile) return
    const strip = track

    const final = tile.offsetLeft + tile.offsetWidth / 2 - viewport.clientWidth / 2
    const first = tileRefs.current[0]
    const nextTile = tileRefs.current[1]
    const stride =
      first && nextTile ? nextTile.offsetLeft - first.offsetLeft : tile.offsetWidth
    const soundOpts = { muted: mutedRef.current }
    const session = beginGachaSpinSound(result.rarity, { ...soundOpts, skip })
    let lastCrossed = -1
    landedRef.current = false

    function finish() {
      if (landedRef.current) return
      landedRef.current = true
      strip.style.transform = `translate3d(${-final}px, 0, 0)`
      setPhase('landed')
      if (!skip) landGachaSpinSound(result.rarity, session, { muted: mutedRef.current })
      onLandedRef.current()
    }

    if (skip) {
      finish()
      return () => stopGachaSpinSound()
    }

    setPhase('spinning')
    strip.style.transform = 'translate3d(0, 0, 0)'
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / GACHA_CAROUSEL_MS)
      const eased = gachaSpinEase(t)
      strip.style.transform = `translate3d(${-final * eased}px, 0, 0)`
      const crossed = stride > 0 ? Math.floor((final * eased) / stride) : 0
      if (crossed !== lastCrossed) {
        lastCrossed = crossed
        playGachaTickSound(t, session, { muted: mutedRef.current })
      }
      if (t < 1) {
        frame = window.requestAnimationFrame(tick)
        return
      }
      finish()
    }

    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
      stopGachaSpinSound()
    }
  }, [playId, result.rarity, skip, targetIndex, tiles])

  return (
    <div
      className={`gacha-carousel is-${phase}${phase === 'landed' ? ` is-${result.rarity}` : ''}`}
      role="img"
      aria-label={
        phase === 'landed'
          ? `${result.rarity} · ${result.character.name}`
          : 'Spinning the banner'
      }
    >
      <span className="gacha-carousel-pointer is-top" aria-hidden="true" />
      <span className="gacha-carousel-pointer is-bottom" aria-hidden="true" />
      <div className="gacha-carousel-marker" aria-hidden="true" />
      {phase === 'landed' ? (
        <>
          <p className={`gacha-rarity-stamp is-${result.rarity}`}>{result.rarity}</p>
          <div className="gacha-land-fx" aria-hidden="true">
            <span className="gacha-land-bloom" />
            <span className="gacha-land-ring" />
            <span className="gacha-land-flare" />
          </div>
        </>
      ) : null}
      <div className="gacha-carousel-viewport" ref={viewportRef}>
        <div className="gacha-carousel-track" ref={trackRef}>
          {tiles.map((character, index) => (
            <div
              className={`gacha-carousel-tile${index === targetIndex ? ' is-winner' : ''}`}
              key={`${playId}-${index}-${character.id}`}
              ref={(node) => {
                tileRefs.current[index] = node
              }}
            >
              <PixelAvatar characterId={character.id} size="lg" decorative />
              <span className="gacha-carousel-name">{character.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
