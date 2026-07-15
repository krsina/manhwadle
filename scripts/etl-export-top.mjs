/**
 * Run manhwadle-etl export-top with TOP_N from catalog.config.json
 * (override with env TOP_N).
 *
 * Usage: node scripts/etl-export-top.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCatalogConfig } from './catalog-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const { topN } = await loadCatalogConfig()
const limit = Math.max(1, Number(process.env.TOP_N) || topN)

const result = spawnSync(
  process.execPath,
  [join(ROOT, 'manhwadle-etl', 'src', 'export-top.mjs'), String(limit)],
  { cwd: join(ROOT, 'manhwadle-etl'), stdio: 'inherit', env: process.env },
)

process.exit(result.status ?? 1)
