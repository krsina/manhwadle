import { describe, expect, it } from 'vitest'
import {
  SECURITY_SMOKE_ACK_VALUE,
  assertSecuritySmokeAllowed,
  isDeniedProductionUrl,
  normalizeEnvString,
  parseProductionRefDenylist,
  projectRefFromSupabaseUrl,
  resolveProductionRefDenylist,
  resolveSecuritySmokeCredentials,
} from './security-smoke-guards.mjs'

const VALID = {
  SECURITY_SMOKE_ACK_NON_PRODUCTION: SECURITY_SMOKE_ACK_VALUE,
  SECURITY_SMOKE_TARGET: 'staging',
  STAGING_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  STAGING_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-staging',
  STAGING_SUPABASE_ANON_KEY: 'anon-key-for-staging',
}

describe('normalizeEnvString', () => {
  it('trims and stringifies', () => {
    expect(normalizeEnvString('  x  ')).toBe('x')
    expect(normalizeEnvString(null)).toBe('')
    expect(normalizeEnvString(undefined)).toBe('')
  })
})

describe('projectRefFromSupabaseUrl', () => {
  it('extracts project refs from supabase.co hosts', () => {
    expect(
      projectRefFromSupabaseUrl('https://SnZhNkCccbxkwerbaido.supabase.co'),
    ).toBe('snzhnkcccbxkwerbaido')
    expect(projectRefFromSupabaseUrl('https://example.com')).toBeNull()
    expect(projectRefFromSupabaseUrl('not-a-url')).toBeNull()
  })
})

describe('isDeniedProductionUrl', () => {
  it('denies known production refs', () => {
    expect(
      isDeniedProductionUrl('https://snzhnkcccbxkwerbaido.supabase.co'),
    ).toBe(true)
    expect(isDeniedProductionUrl('https://staging-abc.supabase.co')).toBe(false)
  })
})

describe('parseProductionRefDenylist / resolveProductionRefDenylist', () => {
  it('parses comma lists and merges defaults', () => {
    expect(parseProductionRefDenylist(' a , B,')).toEqual(['a', 'b'])
    const resolved = resolveProductionRefDenylist('extra-ref,snzhnkcccbxkwerbaido')
    expect(resolved).toContain('snzhnkcccbxkwerbaido')
    expect(resolved).toContain('extra-ref')
    expect(resolved.filter((r) => r === 'snzhnkcccbxkwerbaido')).toHaveLength(1)
  })
})

describe('resolveSecuritySmokeCredentials', () => {
  it('prefers staging-prefixed keys and ignores VITE_ fallbacks', () => {
    const creds = resolveSecuritySmokeCredentials({
      VITE_SUPABASE_URL: 'https://prod.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'prod-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'prod-service',
      STAGING_SUPABASE_URL: 'https://staging.supabase.co',
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'staging-service',
      STAGING_SUPABASE_ANON_KEY: 'staging-anon',
    })
    expect(creds).toEqual({
      url: 'https://staging.supabase.co',
      serviceKey: 'staging-service',
      anonKey: 'staging-anon',
    })
  })

  it('accepts SECURITY_SMOKE_* aliases', () => {
    const creds = resolveSecuritySmokeCredentials({
      SECURITY_SMOKE_SUPABASE_URL: 'https://local.supabase.co',
      SECURITY_SMOKE_SERVICE_ROLE_KEY: 'local-service',
      SECURITY_SMOKE_ANON_KEY: 'local-anon',
    })
    expect(creds.url).toBe('https://local.supabase.co')
    expect(creds.serviceKey).toBe('local-service')
    expect(creds.anonKey).toBe('local-anon')
  })
})

describe('assertSecuritySmokeAllowed', () => {
  it('fails closed without ack / target / credentials', () => {
    expect(assertSecuritySmokeAllowed({}).code).toBe('missing_ack')
    expect(
      assertSecuritySmokeAllowed({
        SECURITY_SMOKE_ACK_NON_PRODUCTION: 'yes',
      }).code,
    ).toBe('invalid_ack')
    expect(
      assertSecuritySmokeAllowed({
        SECURITY_SMOKE_ACK_NON_PRODUCTION: SECURITY_SMOKE_ACK_VALUE,
      }).code,
    ).toBe('missing_target')
    expect(
      assertSecuritySmokeAllowed({
        SECURITY_SMOKE_ACK_NON_PRODUCTION: SECURITY_SMOKE_ACK_VALUE,
        SECURITY_SMOKE_TARGET: 'production',
      }).code,
    ).toBe('invalid_target')
    expect(
      assertSecuritySmokeAllowed({
        SECURITY_SMOKE_ACK_NON_PRODUCTION: SECURITY_SMOKE_ACK_VALUE,
        SECURITY_SMOKE_TARGET: 'staging',
      }).code,
    ).toBe('missing_credentials')
  })

  it('rejects denylisted production URLs even with ack', () => {
    const result = assertSecuritySmokeAllowed({
      ...VALID,
      STAGING_SUPABASE_URL: 'https://snzhnkcccbxkwerbaido.supabase.co',
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('denied_production_url')
  })

  it('allows staging when ack, target, and staging credentials are set', () => {
    const result = assertSecuritySmokeAllowed(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target).toBe('staging')
      expect(result.url).toBe(VALID.STAGING_SUPABASE_URL)
      expect(result.serviceKey).toBe(VALID.STAGING_SUPABASE_SERVICE_ROLE_KEY)
      expect(result.anonKey).toBe(VALID.STAGING_SUPABASE_ANON_KEY)
    }
  })

  it('allows local target for local stack URLs', () => {
    const result = assertSecuritySmokeAllowed({
      ...VALID,
      SECURITY_SMOKE_TARGET: 'local',
      STAGING_SUPABASE_URL: 'http://127.0.0.1:54321',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target).toBe('local')
  })
})
