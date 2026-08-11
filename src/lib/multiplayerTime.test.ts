import { describe, expect, it } from 'vitest'
import {
  multiplayerClockOffsetMs,
  multiplayerRemainingMs,
  parseMultiplayerInstant,
} from './multiplayerTime'

describe('parseMultiplayerInstant', () => {
  it('parses offset timestamps and treats naive ISO as UTC', () => {
    const withZone = parseMultiplayerInstant('2026-08-11T09:00:00.000+00:00')
    const naive = parseMultiplayerInstant('2026-08-11T09:00:00.000')
    const zulu = parseMultiplayerInstant('2026-08-11T09:00:00.000Z')
    expect(withZone).toBe(zulu)
    expect(naive).toBe(zulu)
  })
})

describe('multiplayerRemainingMs', () => {
  it('counts down from server_now even when the payload omitted a timezone', () => {
    const clientNow = Date.parse('2026-08-11T02:00:00.000-07:00')
    const serverNow = '2026-08-11T09:00:00.000'
    const endsAt = '2026-08-11T09:03:00.000+00:00'
    const offset = multiplayerClockOffsetMs(serverNow, clientNow)
    expect(multiplayerRemainingMs(endsAt, offset, clientNow)).toBe(180_000)
  })

  it('does not collapse remaining time when naive server_now would otherwise look local', () => {
    const clientNow = Date.parse('2026-08-11T02:00:00.000-07:00')
    const naiveServerNow = '2026-08-11T09:00:00.000'
    const endsAt = '2026-08-11T09:03:00.000Z'
    const brokenOffset = Date.parse(naiveServerNow) - clientNow
    const fixedOffset = multiplayerClockOffsetMs(naiveServerNow, clientNow)
    expect(multiplayerRemainingMs(endsAt, brokenOffset, clientNow)).toBe(0)
    expect(multiplayerRemainingMs(endsAt, fixedOffset, clientNow)).toBe(180_000)
  })
})
