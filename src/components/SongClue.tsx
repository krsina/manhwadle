import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { clampFocus, cropZoomScale } from '../lib/crops'
import { hashString } from '../lib/daily'
import type { ManhwaSong } from '../lib/songs'
import { HEARDLE_CLIP_SECONDS, songSourceLabel } from '../lib/songs'
import { RevealMoreButton } from './RevealMoreButton'

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string
          width?: string | number
          height?: string | number
          playerVars?: Record<string, number | string>
          events?: {
            onReady?: (e: { target: YtPlayer }) => void
            onStateChange?: (e: { data: number; target: YtPlayer }) => void
            onError?: () => void
          }
        },
      ) => YtPlayer
      PlayerState: { ENDED: number; PLAYING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YtPlayer {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getPlayerState: () => number
}

interface SongClueProps {
  song: ManhwaSong
  clipSeconds: number
  failedGuesses: number
  finished: boolean
  maxGuesses: number
  /** When false, audio-only (hard mode / no video frame). */
  showVideo: boolean
  canRevealMore?: boolean
  onRevealMore?: () => void
}

/** Deterministic zoom origin for MV frames (biased upper/center). */
function songFocusOrigin(songId: string): { focusX: number; focusY: number } {
  const h = hashString(`manhwadle:heardle:zoom:${songId}`)
  return {
    focusX: clampFocus(40 + (h % 21)),
    focusY: clampFocus(28 + ((h >>> 8) % 25), 40),
  }
}

let apiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    const prior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prior?.()
      resolve()
    }
    if (!document.querySelector('script[data-manhwadle-yt]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.manhwadleYt = '1'
      document.head.appendChild(script)
    }
  })
  return apiPromise
}

/** YouTube-backed Heardle clip player with Play-gated progressive reveal. */
export function SongClue({
  song,
  clipSeconds,
  failedGuesses,
  finished,
  maxGuesses,
  showVideo,
  canRevealMore = false,
  onRevealMore,
}: SongClueProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YtPlayer | null>(null)
  const endTimerRef = useRef<number | null>(null)
  const playStartedAtRef = useRef<number | null>(null)
  const playOriginOffsetRef = useRef(0)
  const playDurationRef = useRef(clipSeconds)
  const offsetRef = useRef(0)
  const scrubbingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const clipRef = useRef(clipSeconds)
  const startSec = Math.max(0, song.startSec ?? 0)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [offsetSec, setOffsetSec] = useState(0)
  const [error, setError] = useState(false)

  clipRef.current = clipSeconds

  const clipDuration = finished ? Math.max(clipSeconds, 30) : clipSeconds
  const barMaxSeconds = Math.max(
    HEARDLE_CLIP_SECONDS[HEARDLE_CLIP_SECONDS.length - 1]!,
    clipDuration,
  )
  const unlockedPct = Math.min(100, (clipDuration / barMaxSeconds) * 100)
  const playProgress = clipDuration > 0 ? offsetSec / clipDuration : 0
  const segmentStops = HEARDLE_CLIP_SECONDS.map(
    (sec) => (sec / barMaxSeconds) * 100,
  )

  const scale = cropZoomScale(failedGuesses, { finished })
  const { focusX, focusY } = songFocusOrigin(song.id)
  const originX = clampFocus(focusX)
  const originY = clampFocus(focusY, 40)
  const step = finished
    ? maxGuesses
    : Math.min(failedGuesses + 1, maxGuesses)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(false)
    setPlaying(false)
    setOffsetSec(0)
    offsetRef.current = 0

    async function mount() {
      await loadYouTubeApi()
      if (cancelled || !hostRef.current || !window.YT?.Player) return

      playerRef.current?.destroy()
      playerRef.current = null
      hostRef.current.innerHTML = ''

      const mountEl = document.createElement('div')
      hostRef.current.appendChild(mountEl)

      playerRef.current = new window.YT.Player(mountEl, {
        videoId: song.youtubeId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          start: startSec,
        },
        events: {
          onReady: () => {
            if (!cancelled) setReady(true)
          },
          onError: () => {
            if (!cancelled) {
              setError(true)
              setReady(false)
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT?.PlayerState.ENDED) {
              setPlaying(false)
              offsetRef.current = 0
              setOffsetSec(0)
            }
          },
        },
      })
    }

    void mount()

    return () => {
      cancelled = true
      if (endTimerRef.current != null) {
        window.clearTimeout(endTimerRef.current)
        endTimerRef.current = null
      }
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [song.youtubeId, startSec])

  function clearEndTimer() {
    if (endTimerRef.current != null) {
      window.clearTimeout(endTimerRef.current)
      endTimerRef.current = null
    }
  }

  function clearPlayLoop() {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    playStartedAtRef.current = null
  }

  function currentClipDuration() {
    return finished ? Math.max(clipRef.current, 30) : clipRef.current
  }

  function setOffset(next: number) {
    const duration = currentClipDuration()
    const clamped = Math.min(Math.max(0, next), Math.max(0, duration))
    offsetRef.current = clamped
    setOffsetSec(clamped)
    return clamped
  }

  function tickPlayProgress() {
    if (scrubbingRef.current) return
    const started = playStartedAtRef.current
    const duration = playDurationRef.current
    if (started == null || duration <= 0) return
    const elapsed = (performance.now() - started) / 1000
    const current = Math.min(duration, playOriginOffsetRef.current + elapsed)
    offsetRef.current = current
    setOffsetSec(current)
    if (current < duration) {
      rafRef.current = window.requestAnimationFrame(tickPlayProgress)
    }
  }

  function scheduleClipEnd(fromOffset: number) {
    const player = playerRef.current
    if (!player) return
    const duration = currentClipDuration()
    const remaining = Math.max(0, duration - fromOffset)
    clearEndTimer()
    playDurationRef.current = duration
    playOriginOffsetRef.current = fromOffset
    playStartedAtRef.current = performance.now()
    rafRef.current = window.requestAnimationFrame(tickPlayProgress)
    endTimerRef.current = window.setTimeout(() => {
      try {
        player.pauseVideo()
      } catch {
        /* ignore */
      }
      setPlaying(false)
      clearPlayLoop()
      setOffset(0)
      try {
        player.seekTo(startSec, true)
      } catch {
        /* ignore */
      }
    }, remaining * 1000)
  }

  function seekToOffset(seconds: number, { play }: { play: boolean }) {
    const player = playerRef.current
    if (!player || error || !ready) return
    const duration = currentClipDuration()
    const next = setOffset(Math.min(seconds, Math.max(0, duration - 0.05)))
    try {
      player.seekTo(startSec + next, true)
      if (play) {
        player.playVideo()
        setPlaying(true)
        clearPlayLoop()
        scheduleClipEnd(next)
      } else {
        clearEndTimer()
        clearPlayLoop()
        setPlaying(false)
      }
    } catch {
      setError(true)
    }
  }

  function offsetFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.min(pct * barMaxSeconds, clipDuration)
  }

  function handlePlay() {
    const duration = currentClipDuration()
    const from =
      offsetRef.current > 0 && offsetRef.current < duration - 0.05
        ? offsetRef.current
        : 0
    seekToOffset(from, { play: true })
  }

  function handleStop() {
    clearEndTimer()
    clearPlayLoop()
    try {
      playerRef.current?.pauseVideo()
    } catch {
      /* ignore */
    }
    setPlaying(false)
  }

  function handleScrubPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || error) return
    e.preventDefault()
    scrubbingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const next = offsetFromClientX(e.clientX)
    setOffset(next)
    try {
      playerRef.current?.seekTo(startSec + next, true)
    } catch {
      /* ignore */
    }
  }

  function handleScrubPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return
    const next = offsetFromClientX(e.clientX)
    setOffset(next)
    try {
      playerRef.current?.seekTo(startSec + next, true)
    } catch {
      /* ignore */
    }
  }

  function handleScrubPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const next = offsetFromClientX(e.clientX)
    seekToOffset(next, { play: true })
  }

  const label = songSourceLabel(song.source, song.kind)

  return (
    <section
      className={`clue song-clue${showVideo ? ' is-video-visible' : ' is-audio-only'}`}
      aria-label="Song clue"
    >
      <div className="clue-header song-clue-header">
        <p className="clue-label">
          {finished
            ? showVideo
              ? 'Full reveal'
              : `Song clip · ${label}`
            : showVideo
              ? `Clip clue ${step}/${maxGuesses} · ${label}`
              : `Song clip · ${label}`}
        </p>
        {!finished && (
          <div className="clue-hint-row">
            <p className="clue-hint">
              {showVideo
                ? 'Wrong guesses lengthen the clip and zoom out'
                : 'Wrong guesses lengthen the clip'}
            </p>
            {onRevealMore && (
              <RevealMoreButton
                onClick={onRevealMore}
                disabled={!canRevealMore}
              />
            )}
          </div>
        )}
      </div>

      <div className="song-clue-stage">
        <div
          className={`song-clue-player-wrap${showVideo ? '' : ' is-hidden-video'}`}
          aria-hidden={showVideo && !error ? undefined : true}
        >
          <div
            className="song-clue-zoom"
            style={
              showVideo
                ? {
                    transform: `scale(${scale})`,
                    transformOrigin: `${originX}% ${originY}%`,
                  }
                : undefined
            }
          >
            <div ref={hostRef} className="song-clue-player" />
          </div>
          {!showVideo && !error && (
            <div className="song-clue-audio-face" aria-hidden="true">
              <span className="song-clue-audio-glyph">♪</span>
              <span className="song-clue-audio-caption">Audio only</span>
            </div>
          )}
          {showVideo && !error && (
            <>
              <div className="song-clue-chrome-mask song-clue-chrome-mask-top" aria-hidden="true" />
              <div className="song-clue-chrome-mask song-clue-chrome-mask-bottom" aria-hidden="true" />
              <div className="song-clue-chrome-mask song-clue-chrome-mask-left" aria-hidden="true" />
              <div className="song-clue-chrome-mask song-clue-chrome-mask-right" aria-hidden="true" />
              <div className="song-clue-interaction-block" aria-hidden="true" />
            </>
          )}
        </div>

        {error ? (
          <p className="song-clue-error" role="alert">
            Clip unavailable (removed or region-blocked). Try another day or check
            back later.
          </p>
        ) : (
          <>
            <div className="song-clue-timeline">
              <div
                ref={trackRef}
                className={`song-clue-timeline-track${ready ? ' is-scrubbable' : ''}`}
                role="slider"
                tabIndex={ready ? 0 : -1}
                aria-label="Scrub clip"
                aria-valuemin={0}
                aria-valuemax={clipDuration}
                aria-valuenow={Number(offsetSec.toFixed(1))}
                aria-valuetext={`${offsetSec.toFixed(1)} seconds of ${clipDuration}`}
                aria-disabled={!ready}
                onPointerDown={handleScrubPointerDown}
                onPointerMove={handleScrubPointerMove}
                onPointerUp={handleScrubPointerUp}
                onPointerCancel={handleScrubPointerUp}
                onKeyDown={(e) => {
                  if (!ready || error) return
                  const stepSec = Math.max(0.25, clipDuration / 20)
                  if (e.key === 'ArrowRight' || e.key === 'Right') {
                    e.preventDefault()
                    seekToOffset(offsetRef.current + stepSec, { play: true })
                  } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
                    e.preventDefault()
                    seekToOffset(offsetRef.current - stepSec, { play: true })
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    seekToOffset(0, { play: true })
                  } else if (e.key === 'End') {
                    e.preventDefault()
                    seekToOffset(clipDuration, { play: true })
                  }
                }}
              >
                <div
                  className="song-clue-timeline-unlocked"
                  style={{ width: `${unlockedPct}%` }}
                />
                <div
                  className="song-clue-timeline-playhead"
                  style={{
                    width: `${Math.min(unlockedPct, playProgress * unlockedPct)}%`,
                  }}
                />
                {segmentStops.slice(0, -1).map((pct) => (
                  <span
                    key={pct}
                    className="song-clue-timeline-tick"
                    style={{ left: `${pct}%` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <span className="song-clue-timeline-label">
                {finished
                  ? `${Math.round(offsetSec)}s / ${clipDuration}s`
                  : `${clipSeconds}s / ${HEARDLE_CLIP_SECONDS[HEARDLE_CLIP_SECONDS.length - 1]}s`}
              </span>
            </div>
            <div className="song-clue-controls">
              <button
                type="button"
                className="btn btn-primary song-clue-play"
                onClick={playing ? handleStop : handlePlay}
                disabled={!ready}
              >
                {playing ? 'Stop' : ready ? 'Play clip' : 'Loading…'}
              </button>
              {finished && (
                <p className="song-clue-meta">
                  {song.songTitle}
                  {song.artist ? ` · ${song.artist}` : ''}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
