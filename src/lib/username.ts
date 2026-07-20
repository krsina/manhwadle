/** Client-side username policy (mirrors server rules; server is authoritative). */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30

const RESERVED = new Set([
  'admin',
  'administrator',
  'mod',
  'moderator',
  'owner',
  'support',
  'help',
  'staff',
  'official',
  'manhwadle',
  'system',
  'root',
  'null',
  'undefined',
  'anonymous',
  'guest',
  'api',
  'bot',
])

const BLOCKED_TERMS = [
  'fuck',
  'fuk',
  'fock',
  'fvck',
  'shit',
  'asshole',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'rape',
  'porn',
  'sex',
]

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
}

export type UsernameClientError =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'unavailable'

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function foldUsernameConfusables(raw: string): string {
  const lower = raw.trim().toLowerCase()
  let out = ''
  for (const ch of lower) {
    out += LEET_MAP[ch] ?? ch
  }
  return out.replaceAll('_', '')
}

export function validateUsernameClient(
  raw: string,
): { ok: true; username: string; normalized: string } | { ok: false; error: UsernameClientError } {
  const username = raw.trim()
  if (!username) return { ok: false, error: 'empty' }
  if (username.length < USERNAME_MIN) return { ok: false, error: 'too_short' }
  if (username.length > USERNAME_MAX) return { ok: false, error: 'too_long' }
  if (!USERNAME_PATTERN.test(username)) return { ok: false, error: 'invalid_chars' }

  const normalized = normalizeUsername(username)
  const folded = foldUsernameConfusables(username)

  if (RESERVED.has(normalized) || RESERVED.has(folded)) {
    return { ok: false, error: 'unavailable' }
  }
  for (const term of BLOCKED_TERMS) {
    if (normalized === term || folded === term || folded.includes(term)) {
      return { ok: false, error: 'unavailable' }
    }
  }

  return { ok: true, username, normalized }
}

/** Generic copy for availability / policy failures (enumeration-safe). */
export function usernameErrorMessage(error: UsernameClientError | string | null | undefined): string {
  switch (error) {
    case 'empty':
      return 'Enter a username.'
    case 'too_short':
      return `Use at least ${USERNAME_MIN} characters.`
    case 'too_long':
      return `Use at most ${USERNAME_MAX} characters.`
    case 'invalid_chars':
      return 'Use only letters, numbers, and underscores.'
    case 'cooldown':
      return 'You can change your username again after the cooldown.'
    case 'claim_required':
      return 'Choose a username to continue.'
    case 'already_claimed':
      return 'You already have a username. Change it from Settings.'
    case 'not_authenticated':
      return 'Sign in to continue.'
    case 'cloud_banned':
      return 'Cloud account writes are disabled for this account.'
    case 'unavailable':
    default:
      if (error === 'unavailable' || !error) {
        return 'This username is not available.'
      }
      return 'This username is not available.'
  }
}

export function formatNextChangeAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
