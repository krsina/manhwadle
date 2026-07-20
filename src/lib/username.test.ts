import { describe, expect, it } from 'vitest'
import {
  foldUsernameConfusables,
  normalizeUsername,
  usernameErrorMessage,
  validateUsernameClient,
} from './username'

describe('validateUsernameClient', () => {
  it('accepts ASCII letters, numbers, underscore within length', () => {
    expect(validateUsernameClient('Kris_42')).toEqual({
      ok: true,
      username: 'Kris_42',
      normalized: 'kris_42',
    })
  })

  it('rejects short, long, and invalid characters', () => {
    expect(validateUsernameClient('ab').ok).toBe(false)
    expect(validateUsernameClient('a'.repeat(21)).ok).toBe(false)
    expect(validateUsernameClient('bad-name').ok).toBe(false)
    expect(validateUsernameClient('has space').ok).toBe(false)
  })

  it('rejects reserved and leetspeak/profanity folds with generic unavailable', () => {
    expect(validateUsernameClient('Admin')).toEqual({ ok: false, error: 'unavailable' })
    expect(validateUsernameClient('manhwadle')).toEqual({ ok: false, error: 'unavailable' })
    expect(validateUsernameClient('f0ck')).toEqual({ ok: false, error: 'unavailable' })
    expect(validateUsernameClient('sh1t')).toEqual({ ok: false, error: 'unavailable' })
  })
})

describe('normalize helpers', () => {
  it('normalizes case and folds confusables', () => {
    expect(normalizeUsername('  Foo_Bar ')).toBe('foo_bar')
    expect(foldUsernameConfusables('F0o_B4r')).toBe('foobar')
  })

  it('maps policy errors to user-safe copy', () => {
    expect(usernameErrorMessage('unavailable')).toMatch(/not available/i)
    expect(usernameErrorMessage('invalid_chars')).toMatch(/letters/i)
  })
})
