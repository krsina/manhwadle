/**
 * Parse multiplayer ISO timestamps. Postgres sometimes emits timestamptz with an
 * offset, and sometimes (via timestamp-without-tz) a naive ISO string. Treat
 * naive values as UTC so client clocks outside UTC don't zero the timer.
 */
export function parseMultiplayerInstant(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const trimmed = value.trim()
  if (!trimmed) return Number.NaN
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)
  const normalized = hasZone ? trimmed : `${trimmed}Z`
  return Date.parse(normalized)
}

export function multiplayerClockOffsetMs(
  serverNow: string | null | undefined,
  clientNowMs: number = Date.now(),
): number {
  const parsed = parseMultiplayerInstant(serverNow)
  return Number.isFinite(parsed) ? parsed - clientNowMs : 0
}

export function multiplayerRemainingMs(
  endsAt: string | null | undefined,
  offsetMs: number,
  clientNowMs: number = Date.now(),
): number {
  const target = parseMultiplayerInstant(endsAt)
  if (!Number.isFinite(target)) return 0
  return Math.max(0, target - (clientNowMs + offsetMs))
}
