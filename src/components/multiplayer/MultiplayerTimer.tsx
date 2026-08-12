import { useEffect, useMemo, useState } from 'react'
import {
  multiplayerClockOffsetMs,
  multiplayerRemainingMs,
} from '../../lib/multiplayerTime'

interface MultiplayerTimerProps {
  endsAt: string | null
  serverNow?: string | null
  label: string
  /** Phase length; controls whether warning and critical thresholds apply. */
  durationMs?: number
  variant?: 'inline' | 'hero'
}

/** Only long phases (a full round) get warning/critical treatment. */
const URGENCY_MIN_DURATION_MS = 60_000
const WARNING_MS = 30_000
const CRITICAL_MS = 10_000

export function MultiplayerTimer({
  endsAt,
  serverNow = null,
  label,
  durationMs,
  variant = 'inline',
}: MultiplayerTimerProps) {
  const offsetMs = useMemo(
    () => multiplayerClockOffsetMs(serverNow),
    [serverNow],
  )
  const [remaining, setRemaining] = useState(() =>
    multiplayerRemainingMs(endsAt, offsetMs),
  )

  useEffect(() => {
    setRemaining(multiplayerRemainingMs(endsAt, offsetMs))
    const timer = window.setInterval(() => {
      setRemaining(multiplayerRemainingMs(endsAt, offsetMs))
    }, 250)
    return () => window.clearInterval(timer)
  }, [endsAt, offsetMs])

  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const showSecondsOnly = variant === 'hero' && totalSeconds < 60
  const readout = showSecondsOnly
    ? String(totalSeconds)
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
  const accessibleLabel = label.trim().replace(/:$/, '')

  const urgencyEnabled = durationMs == null || durationMs >= URGENCY_MIN_DURATION_MS
  const urgency = !urgencyEnabled
    ? ''
    : remaining <= CRITICAL_MS
      ? ' is-critical'
      : remaining <= WARNING_MS
        ? ' is-warning'
        : ''
  return (
    <div
      className={`multiplayer-timer multiplayer-timer-${variant}${urgency}`}
      role="timer"
      aria-label={`${accessibleLabel}: ${readout}`}
      aria-live={remaining <= CRITICAL_MS ? 'polite' : 'off'}
      aria-atomic="true"
    >
      <small>{label}</small>
      <strong>{readout}</strong>
    </div>
  )
}
