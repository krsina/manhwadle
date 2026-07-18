#!/usr/bin/env node
/**
 * Live Supabase smoke check against rebuilt local puzzle pools.
 *
 * Requires VITE_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npm run test:live
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildRows, guessableCharacters } from './lib/puzzle-pools.mjs'

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
    return loadEnvFile(await readFile(join(ROOT, '.env'), 'utf8'))
  } catch {
    return {}
  }
}

/** UTC YYYY-MM-DD — matches src/lib/daily.ts getTodayKey */
function getTodayKey(date = new Date()) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fail(message) {
  console.error(`[fail] ${message}`)
  process.exitCode = 1
}

async function main() {
  const fileEnv = await loadDotEnv()
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error(
      'Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL — skip live smoke.',
    )
    process.exit(1)
  }

  const [manhwaRaw, blurbRaw, cropRaw] = await Promise.all([
    readFile(join(DATA, 'manhwa.json'), 'utf8'),
    readFile(join(DATA, 'storyDescriptionBlurb.json'), 'utf8'),
    readFile(join(DATA, 'characterCrop.json'), 'utf8'),
  ])
  const manhwa = JSON.parse(manhwaRaw)
  const blurbDoc = JSON.parse(blurbRaw)
  const cropDoc = JSON.parse(cropRaw)
  const blurbIds = new Set((blurbDoc.entries || []).map((e) => e.manhwaId))
  const cropIds = new Set((cropDoc.entries || []).map((e) => e.manhwaId))
  const localRows = buildRows(manhwa, blurbIds, cropIds)
  const byId = new Map(manhwa.map((m) => [m.id, m]))

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { count, error: countErr } = await supabase
    .from('puzzle_pool_entries')
    .select('*', { count: 'exact', head: true })
  if (countErr) throw countErr
  if (count !== localRows.length) {
    fail(
      `puzzle_pool_entries count ${count} !== local rebuilt ${localRows.length}`,
    )
  } else {
    console.log(`[ok] puzzle_pool_entries count=${count}`)
  }

  const dateKey = getTodayKey()
  const { data: dailies, error: dailyErr } = await supabase
    .from('daily_puzzles')
    .select('date_key, mode, taste, answer_id, character_id')
    .eq('date_key', dateKey)
  if (dailyErr) throw dailyErr

  const MODES = ['summary', 'character', 'cover', 'heardle']
  const TASTES = ['action', 'romance', 'both']
  const expectedLanes = new Set(
    MODES.flatMap((mode) => TASTES.map((taste) => `${mode}/${taste}`)),
  )

  if (!dailies || dailies.length !== 12) {
    fail(`expected 12 daily_puzzles for ${dateKey}, got ${dailies?.length ?? 0}`)
  } else {
    console.log(`[ok] daily_puzzles for ${dateKey}: ${dailies.length}`)
  }

  const seenLanes = new Set()
  for (const row of dailies || []) {
    const lane = `${row.mode}/${row.taste}`
    seenLanes.add(lane)
    if (!expectedLanes.has(lane)) {
      fail(`unexpected daily lane ${lane}`)
    }

    const title = byId.get(row.answer_id)
    if (!title) {
      fail(`${lane}: answer_id ${row.answer_id} missing from manhwa.json`)
      continue
    }
    if (row.mode === 'character') {
      if (row.character_id == null) {
        fail(`${lane}: character_id is null`)
        continue
      }
      const eligible = new Set(guessableCharacters(title).map((c) => c.id))
      const cropOk = (cropDoc.entries || []).some(
        (e) =>
          e.manhwaId === title.id &&
          (e.characterId == null || e.characterId === row.character_id),
      )
      if (!eligible.has(row.character_id) && !cropOk) {
        fail(
          `${lane}: character_id ${row.character_id} not eligible for manhwa ${title.id}`,
        )
      }
    }
    if (row.mode === 'heardle') {
      const localHeardle = localRows.filter(
        (r) => r.mode === 'heardle' && r.taste === row.taste,
      )
      if (!localHeardle.some((r) => r.manhwa_id === row.answer_id)) {
        fail(
          `${lane}: answer_id ${row.answer_id} not in local heardle pool for taste`,
        )
      }
    }
  }

  for (const lane of expectedLanes) {
    if (!seenLanes.has(lane)) fail(`missing daily lane ${lane}`)
  }

  const heardleDailies = (dailies || []).filter((r) => r.mode === 'heardle')
  if (heardleDailies.length !== 3) {
    fail(`expected 3 heardle daily_puzzles, got ${heardleDailies.length}`)
  } else {
    console.log('[ok] heardle daily lanes present for all tastes')
  }

  const localHeardleCount = localRows.filter((r) => r.mode === 'heardle').length
  if (localHeardleCount === 0) {
    fail('local rebuilt heardle pool is empty')
  } else {
    console.log(`[ok] local heardle pool rows=${localHeardleCount}`)
  }

  if (process.exitCode) {
    console.error('[done] live smoke failed')
    process.exit(process.exitCode)
  }
  console.log('[done] live smoke passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
