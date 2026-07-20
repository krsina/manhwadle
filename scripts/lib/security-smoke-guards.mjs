/**
 * Staging-only guards for adversarial security smoke.
 * Pure helpers — no I/O — so unit tests stay offline.
 */

/** Exact acknowledgment required before any live security negatives run. */
export const SECURITY_SMOKE_ACK_VALUE = 'I_UNDERSTAND_STAGING_ONLY'

/** Allowed SECURITY_SMOKE_TARGET values (never production). */
export const SECURITY_SMOKE_ALLOWED_TARGETS = Object.freeze(['staging', 'local'])

/**
 * Known production Supabase project refs that must never be targeted.
 * Keep in sync with docs/.env.example production project.
 */
export const DEFAULT_PRODUCTION_PROJECT_REFS = Object.freeze([
  'snzhnkcccbxkwerbaido',
])

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEnvString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * Extract the Supabase project ref from a project URL.
 * @param {string} url
 * @returns {string | null}
 */
export function projectRefFromSupabaseUrl(url) {
  const raw = normalizeEnvString(url)
  if (!raw) return null
  let hostname
  try {
    hostname = new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
  const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(hostname)
  return m ? m[1].toLowerCase() : null
}

/**
 * @param {string} url
 * @param {readonly string[]} [denyRefs]
 * @returns {boolean}
 */
export function isDeniedProductionUrl(url, denyRefs = DEFAULT_PRODUCTION_PROJECT_REFS) {
  const ref = projectRefFromSupabaseUrl(url)
  if (!ref) return false
  const denied = new Set(
    denyRefs.map((r) => normalizeEnvString(r).toLowerCase()).filter(Boolean),
  )
  return denied.has(ref)
}

/**
 * Parse optional comma-separated extra production refs from env.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseProductionRefDenylist(raw) {
  return normalizeEnvString(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Merge default + env denylist and de-dupe.
 * @param {string} [extraRaw]
 * @param {readonly string[]} [defaults]
 * @returns {string[]}
 */
export function resolveProductionRefDenylist(
  extraRaw = '',
  defaults = DEFAULT_PRODUCTION_PROJECT_REFS,
) {
  const seen = new Set()
  const out = []
  for (const ref of [...defaults, ...parseProductionRefDenylist(extraRaw)]) {
    const key = normalizeEnvString(ref).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * Resolve credentials preferring staging-prefixed env vars.
 * @param {Record<string, string | undefined>} env
 */
export function resolveSecuritySmokeCredentials(env) {
  const url =
    normalizeEnvString(env.STAGING_SUPABASE_URL) ||
    normalizeEnvString(env.SECURITY_SMOKE_SUPABASE_URL) ||
    ''
  const serviceKey =
    normalizeEnvString(env.STAGING_SUPABASE_SERVICE_ROLE_KEY) ||
    normalizeEnvString(env.SECURITY_SMOKE_SERVICE_ROLE_KEY) ||
    ''
  const anonKey =
    normalizeEnvString(env.STAGING_SUPABASE_ANON_KEY) ||
    normalizeEnvString(env.STAGING_SUPABASE_PUBLISHABLE_KEY) ||
    normalizeEnvString(env.SECURITY_SMOKE_ANON_KEY) ||
    ''
  return { url, serviceKey, anonKey }
}

/**
 * @typedef {{
 *   ok: true,
 *   target: 'staging' | 'local',
 *   url: string,
 *   serviceKey: string,
 *   anonKey: string,
 *   productionRefsDenied: string[],
 * }} SecuritySmokeAllowed
 *
 * @typedef {{
 *   ok: false,
 *   reason: string,
 *   code:
 *     | 'missing_ack'
 *     | 'invalid_ack'
 *     | 'missing_target'
 *     | 'invalid_target'
 *     | 'missing_credentials'
 *     | 'denied_production_url'
 *     | 'invalid_url',
 * }} SecuritySmokeBlocked
 */

/**
 * Fail-closed gate: requires explicit non-production target + acknowledgment
 * and staging-prefixed credentials. Never falls back to VITE_/production .env keys.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {SecuritySmokeAllowed | SecuritySmokeBlocked}
 */
export function assertSecuritySmokeAllowed(env) {
  const ack = normalizeEnvString(env.SECURITY_SMOKE_ACK_NON_PRODUCTION)
  if (!ack) {
    return {
      ok: false,
      code: 'missing_ack',
      reason:
        'Set SECURITY_SMOKE_ACK_NON_PRODUCTION=I_UNDERSTAND_STAGING_ONLY (staging/local only).',
    }
  }
  if (ack !== SECURITY_SMOKE_ACK_VALUE) {
    return {
      ok: false,
      code: 'invalid_ack',
      reason: `SECURITY_SMOKE_ACK_NON_PRODUCTION must be exactly "${SECURITY_SMOKE_ACK_VALUE}".`,
    }
  }

  const target = normalizeEnvString(env.SECURITY_SMOKE_TARGET).toLowerCase()
  if (!target) {
    return {
      ok: false,
      code: 'missing_target',
      reason:
        'Set SECURITY_SMOKE_TARGET=staging (or local). Production targets are rejected.',
    }
  }
  if (!SECURITY_SMOKE_ALLOWED_TARGETS.includes(target)) {
    return {
      ok: false,
      code: 'invalid_target',
      reason: `SECURITY_SMOKE_TARGET="${target}" is not allowed (use staging or local).`,
    }
  }

  const { url, serviceKey, anonKey } = resolveSecuritySmokeCredentials(env)
  if (!url || !serviceKey || !anonKey) {
    return {
      ok: false,
      code: 'missing_credentials',
      reason:
        'Missing STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY + STAGING_SUPABASE_ANON_KEY (or SECURITY_SMOKE_* equivalents). Does not read VITE_/production keys.',
    }
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return {
      ok: false,
      code: 'invalid_url',
      reason: 'STAGING / SECURITY_SMOKE Supabase URL is not a valid URL.',
    }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: 'invalid_url',
      reason: 'Supabase URL must be http(s).',
    }
  }

  const productionRefsDenied = resolveProductionRefDenylist(
    env.SECURITY_SMOKE_PRODUCTION_REF_DENYLIST,
  )
  if (isDeniedProductionUrl(url, productionRefsDenied)) {
    return {
      ok: false,
      code: 'denied_production_url',
      reason:
        'Refusing to run security negatives against a denylisted production project ref.',
    }
  }

  return {
    ok: true,
    target: /** @type {'staging' | 'local'} */ (target),
    url,
    serviceKey,
    anonKey,
    productionRefsDenied,
  }
}
