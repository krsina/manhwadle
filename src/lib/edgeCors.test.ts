import { describe, expect, it } from 'vitest'
import {
  buildCorsHeaders,
  isOriginAllowed,
  LOCAL_DEV_ORIGINS,
  parseAllowedOrigins,
  resolveAllowOrigin,
} from '../../supabase/functions/_shared/cors.ts'
import {
  findSpoofedCallerIdKey,
  spoofedCallerIdErrorMessage,
} from '../../supabase/functions/_shared/callerIds.ts'

describe('edge CORS allowlist', () => {
  it('defaults to local Vite origins when env is unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([...LOCAL_DEV_ORIGINS])
    expect(parseAllowedOrigins('')).toEqual([...LOCAL_DEV_ORIGINS])
    expect(parseAllowedOrigins('  ')).toEqual([...LOCAL_DEV_ORIGINS])
  })

  it('parses comma-separated hosted origins', () => {
    expect(
      parseAllowedOrigins(
        'https://manhwadle.com, https://*.pages.dev, http://localhost:5173',
      ),
    ).toEqual([
      'https://manhwadle.com',
      'https://*.pages.dev',
      'http://localhost:5173',
    ])
  })

  it('reflects only allowlisted Origin headers (never *)', () => {
    const allowed = parseAllowedOrigins(
      'https://manhwadle.com,https://*.pages.dev',
    )
    expect(resolveAllowOrigin('https://manhwadle.com', allowed)).toBe(
      'https://manhwadle.com',
    )
    expect(resolveAllowOrigin('https://preview.pages.dev', allowed)).toBe(
      'https://preview.pages.dev',
    )
    expect(resolveAllowOrigin('https://evil.example', allowed)).toBeNull()
    expect(resolveAllowOrigin(null, allowed)).toBeNull()
    expect(isOriginAllowed('https://nested.evil.pages.dev', allowed)).toBe(
      false,
    )

    const headers = buildCorsHeaders({
      requestOrigin: 'https://manhwadle.com',
      allowedOriginsEnv: 'https://manhwadle.com',
      methods: 'POST, OPTIONS',
    })
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://manhwadle.com',
    )
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*')
    expect(headers.Vary).toBe('Origin')

    const blocked = buildCorsHeaders({
      requestOrigin: 'https://evil.example',
      allowedOriginsEnv: 'https://manhwadle.com',
      methods: 'POST, OPTIONS',
    })
    expect(blocked['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('edge caller identity rejection', () => {
  it('flags spoofed actor/user id keys', () => {
    expect(findSpoofedCallerIdKey({ action: 'list_reports' })).toBeNull()
    expect(
      findSpoofedCallerIdKey({
        action: 'grant_role',
        target_user_id: '11111111-1111-1111-1111-111111111111',
      }),
    ).toBeNull()
    expect(findSpoofedCallerIdKey({ actor_id: 'x' })).toBe('actor_id')
    expect(findSpoofedCallerIdKey({ actorId: 'x' })).toBe('actorId')
    expect(findSpoofedCallerIdKey({ user_id: 'x' })).toBe('user_id')
    expect(findSpoofedCallerIdKey({ userId: 'x' })).toBe('userId')
    expect(spoofedCallerIdErrorMessage('actor_id')).toContain('JWT')
  })
})
