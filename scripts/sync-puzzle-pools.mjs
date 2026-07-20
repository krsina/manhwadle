/**
 * Upsert puzzle_pool_entries for all mode × taste lanes, then ensure today's
 * daily_puzzles rows exist (same eligibility + FNV seeding as the client).
 *
 * Requires either:
 *   SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL (or SUPABASE_URL)
 * or --sql-only to print SQL for manual apply.
 *
 * Usage:
 *   node scripts/sync-puzzle-pools.mjs
 *   node scripts/sync-puzzle-pools.mjs --sql-only
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildRows, rowsToSql } from './lib/puzzle-pools.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data')

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

async function loadDotEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8')
    return loadEnvFile(raw)
  } catch {
    return {}
  }
}

async function main() {
  const sqlOnly = process.argv.includes('--sql-only')
  const jsonOnly = process.argv.includes('--json-only')
  const [manhwaRaw, blurbRaw, cropRaw] = await Promise.all([
    readFile(join(DATA, 'manhwa.json'), 'utf8'),
    readFile(join(DATA, 'storyDescriptionBlurb.json'), 'utf8'),
    readFile(join(DATA, 'characterCrop.json'), 'utf8'),
  ])
  const manhwa = JSON.parse(manhwaRaw)
  const blurbDoc = JSON.parse(blurbRaw)
  const cropDoc = JSON.parse(cropRaw)
  const rows = buildRows(manhwa, blurbDoc, cropDoc)
  console.log(`Built ${rows.length} puzzle_pool_entries`)

  if (jsonOnly) {
    const out = join(ROOT, 'scripts', 'puzzle-pools.json')
    await writeFile(out, JSON.stringify(rows), 'utf8')
    console.log(`Wrote ${out}`)
    return
  }

  if (sqlOnly) {
    const out = join(ROOT, 'scripts', 'puzzle-pools.sql')
    await writeFile(out, rowsToSql(rows), 'utf8')
    console.log(`Wrote ${out}`)
    return
  }

  const fileEnv = await loadDotEnv()
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    const out = join(ROOT, 'scripts', 'puzzle-pools.sql')
    await writeFile(out, rowsToSql(rows), 'utf8')
    console.warn(
      'Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL — wrote SQL instead:',
      out,
    )
    return
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Replace pools atomically per mode/taste by truncate + insert in chunks
  const { error: truncErr } = await supabase
    .from('puzzle_pool_entries')
    .delete()
    .gte('position', 0)
  if (truncErr) throw truncErr

  const chunkSize = 500
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('puzzle_pool_entries').insert(chunk)
    if (error) throw error
  }

  const { data, error: ensureErr } = await supabase.rpc('ensure_daily_puzzles')
  if (ensureErr) throw ensureErr
  console.log(`Upserted pools; ensure_daily_puzzles inserted ${data ?? 0} lanes`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
