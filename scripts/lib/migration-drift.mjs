/**
 * Pure helpers for comparing local Supabase migration filenames
 * against remote migration history (CLI JSON / version lists).
 * Keep this module free of I/O so unit tests stay offline.
 */

const VERSION_RE = /^\d{14}$/

/**
 * Strip connection strings, JWTs, and password flags from CLI / error text.
 * @param {string} text
 * @param {readonly string[]} [extraSecrets]
 */
export function redactSecrets(text, extraSecrets = []) {
  let out = String(text ?? '')
  out = out.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, 'postgres://***')
  out = out.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    '[redacted-jwt]',
  )
  out = out.replace(/--db-url(?:=|\s+)\S+/gi, '--db-url ***')
  out = out.replace(/--password(?:=|\s+)\S+/gi, '--password ***')
  out = out.replace(/\bpassword[=:]\S+/gi, 'password=***')
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 8) continue
    out = out.split(secret).join('[redacted]')
  }
  return out
}

/**
 * @param {string} filename
 * @returns {string | null} 14-digit version prefix, or null if invalid
 */
export function migrationVersionFromFilename(filename) {
  const base = String(filename).replace(/\\/g, '/').split('/').pop() ?? ''
  if (!base.endsWith('.sql')) return null
  const stamp = base.slice(0, 14)
  return VERSION_RE.test(stamp) ? stamp : null
}

/**
 * @param {readonly string[]} filenames
 * @returns {{ versions: string[], invalid: string[] }}
 */
export function listLocalMigrationVersions(filenames) {
  const versions = []
  const invalid = []
  const seen = new Set()
  for (const name of filenames) {
    if (!String(name).endsWith('.sql')) continue
    const version = migrationVersionFromFilename(name)
    if (!version) {
      invalid.push(name)
      continue
    }
    if (!seen.has(version)) {
      seen.add(version)
      versions.push(version)
    }
  }
  versions.sort()
  return { versions, invalid }
}

/**
 * Parse `supabase migration list --output-format json` payload.
 * Remote history is the non-empty `remote` column; local CLI column is ignored
 * so the repo filesystem remains the local source of truth.
 *
 * @param {unknown} payload
 * @returns {string[]}
 */
export function remoteVersionsFromMigrationList(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray(payload.migrations)
      ? payload.migrations
      : null
  if (!rows) {
    throw new Error('Unexpected migration list JSON (missing migrations array)')
  }
  const versions = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const remote = String(row.remote ?? '').trim()
    if (!remote) continue
    if (!VERSION_RE.test(remote)) {
      throw new Error(`Unexpected remote migration version: ${remote}`)
    }
    if (!seen.has(remote)) {
      seen.add(remote)
      versions.push(remote)
    }
  }
  versions.sort()
  return versions
}

/**
 * @param {readonly string[]} localVersions
 * @param {readonly string[]} remoteVersions
 */
export function compareMigrationVersions(localVersions, remoteVersions) {
  const local = new Set(localVersions)
  const remote = new Set(remoteVersions)
  const matched = [...local].filter((v) => remote.has(v)).sort()
  const localOnly = [...local].filter((v) => !remote.has(v)).sort()
  const remoteOnly = [...remote].filter((v) => !local.has(v)).sort()
  return {
    matched,
    localOnly,
    remoteOnly,
    inSync: localOnly.length === 0 && remoteOnly.length === 0,
    localCount: local.size,
    remoteCount: remote.size,
  }
}

/**
 * @param {ReturnType<typeof compareMigrationVersions>} result
 * @param {{ projectHint?: string }} [opts]
 */
export function formatDriftReport(result, opts = {}) {
  const lines = []
  const hint = opts.projectHint ? ` (${opts.projectHint})` : ''
  lines.push(
    `Migration drift check${hint}: local=${result.localCount} remote=${result.remoteCount} matched=${result.matched.length}`,
  )
  if (result.inSync) {
    lines.push('OK — local filenames match remote migration history')
    return lines.join('\n')
  }
  lines.push('DRIFT — local migration filenames differ from remote history')
  if (result.localOnly.length) {
    lines.push(`Local only (${result.localOnly.length}):`)
    for (const v of result.localOnly) lines.push(`  + ${v}`)
  }
  if (result.remoteOnly.length) {
    lines.push(`Remote only (${result.remoteOnly.length}):`)
    for (const v of result.remoteOnly) lines.push(`  - ${v}`)
  }
  lines.push('See docs/runbooks/migration-drift.md for repair steps.')
  return lines.join('\n')
}
