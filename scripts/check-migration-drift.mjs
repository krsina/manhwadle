#!/usr/bin/env node
/**
 * Read-only compare of local supabase/migrations filenames vs remote history.
 *
 * Default: `supabase migration list --linked --output-format json`
 * Optional: SUPABASE_DB_URL / --db-url (percent-encoded; never logged)
 * Optional: SUPABASE_DB_PASSWORD / --password (never logged)
 *
 * Repo filesystem is the local source of truth. Remote versions come from the
 * CLI remote column (linked project or --db-url target).
 *
 * Usage: npm run check:migration-drift
 * See docs/runbooks/migration-drift.md
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareMigrationVersions,
  formatDriftReport,
  listLocalMigrationVersions,
  redactSecrets,
  remoteVersionsFromMigrationList,
} from './lib/migration-drift.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const migrationsDir = path.join(root, 'supabase', 'migrations')

function loadEnvFile(text) {
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function loadDotEnv() {
  try {
    return loadEnvFile(fs.readFileSync(path.join(root, '.env'), 'utf8'))
  } catch {
    return {}
  }
}

function readProjectHint() {
  try {
    const toml = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8')
    const match = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m)
    return match?.[1] ?? undefined
  } catch {
    return undefined
  }
}

function parseArgs(argv) {
  /** @type {{ dbUrl?: string, password?: string }} */
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--db-url' || arg.startsWith('--db-url=')) {
      out.dbUrl = arg.includes('=') ? arg.slice('--db-url='.length) : argv[++i]
      continue
    }
    if (arg === '--password' || arg === '-p' || arg.startsWith('--password=')) {
      out.password = arg.includes('=')
        ? arg.slice('--password='.length)
        : argv[++i]
      continue
    }
    if (arg === '--help' || arg === '-h') {
      out.help = true
    }
  }
  return out
}

function printHelp() {
  console.log(`Usage: node scripts/check-migration-drift.mjs [options]

Read-only drift check: local supabase/migrations vs remote migration history.

Options:
  --db-url <url>     Percent-encoded Postgres URL (or set SUPABASE_DB_URL)
  --password, -p     DB password for linked mode (or set SUPABASE_DB_PASSWORD)
  -h, --help         Show this help

Default mode uses the linked Supabase project (supabase link / config.toml).
Never prints connection strings, passwords, or API keys.
`)
}

/**
 * Run `supabase <args…>` without a shell (avoids secret leakage / Windows .cmd EINVAL).
 * Tries PATH first, then `node …/npx-cli.js supabase …`.
 * @param {string[]} supabaseArgs args after the `supabase` binary name
 */
function runSupabaseCli(supabaseArgs) {
  const direct = spawnSync('supabase', supabaseArgs, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  })
  if (!direct.error) return direct

  const npxCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npx-cli.js',
  )
  if (!fs.existsSync(npxCli)) return direct
  return spawnSync(process.execPath, [npxCli, 'supabase', ...supabaseArgs], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  })
}

/**
 * @param {{ dbUrl?: string, password?: string }} opts
 * @param {Record<string, string | undefined>} fileEnv
 */
function fetchRemoteMigrationList(opts, fileEnv) {
  const dbUrl =
    opts.dbUrl ||
    process.env.SUPABASE_DB_URL ||
    fileEnv.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    fileEnv.DATABASE_URL
  const password =
    opts.password ||
    process.env.SUPABASE_DB_PASSWORD ||
    fileEnv.SUPABASE_DB_PASSWORD

  const cliArgs = ['migration', 'list', '--output-format', 'json']
  if (dbUrl) {
    cliArgs.push('--db-url', dbUrl)
  } else {
    cliArgs.push('--linked')
    if (password) cliArgs.push('--password', password)
  }

  const result = runSupabaseCli(cliArgs)
  const secrets = [dbUrl, password].filter(Boolean)
  const stdout = redactSecrets(result.stdout ?? '', secrets)
  const stderr = redactSecrets(result.stderr ?? '', secrets)

  if (result.error) {
    const msg = redactSecrets(result.error.message, secrets)
    throw new Error(`Failed to run supabase CLI: ${msg}`)
  }
  if (result.status !== 0) {
    const detail =
      [stderr, stdout].filter(Boolean).join('\n').trim() || `exit ${result.status}`
    throw new Error(`supabase migration list failed:\n${detail}`)
  }

  const jsonText = (result.stdout ?? '').trim()
  if (!jsonText) {
    throw new Error('supabase migration list returned empty output')
  }

  // CLI may print progress lines on stderr; stdout should be JSON.
  let payload
  try {
    payload = JSON.parse(jsonText)
  } catch {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('Could not parse migration list JSON from supabase CLI')
    }
    payload = JSON.parse(jsonText.slice(start, end + 1))
  }
  return remoteVersionsFromMigrationList(payload)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const fileEnv = loadDotEnv()
  const files = fs.readdirSync(migrationsDir)
  const { versions: localVersions, invalid } = listLocalMigrationVersions(files)
  if (invalid.length) {
    console.error('Unexpected migration filename(s):')
    for (const name of invalid) console.error(`  ${name}`)
    process.exitCode = 1
    return
  }

  let remoteVersions
  try {
    remoteVersions = fetchRemoteMigrationList(args, fileEnv)
  } catch (err) {
    const secrets = [
      args.dbUrl,
      process.env.SUPABASE_DB_URL,
      fileEnv.SUPABASE_DB_URL,
      process.env.DATABASE_URL,
      fileEnv.DATABASE_URL,
      args.password,
      process.env.SUPABASE_DB_PASSWORD,
      fileEnv.SUPABASE_DB_PASSWORD,
    ].filter(Boolean)
    console.error(redactSecrets(err instanceof Error ? err.message : String(err), secrets))
    console.error(
      'Link a project (`supabase link`) or set SUPABASE_DB_URL. See docs/runbooks/migration-drift.md',
    )
    process.exitCode = 1
    return
  }

  const result = compareMigrationVersions(localVersions, remoteVersions)
  const report = formatDriftReport(result, { projectHint: readProjectHint() })
  if (result.inSync) {
    console.log(report)
    return
  }
  console.error(report)
  process.exitCode = 1
}

main()
