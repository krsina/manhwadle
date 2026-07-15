/**
 * Shared catalog size from root catalog.config.json.
 * Used by Node sync/export scripts so they stay in sync with the Vite app.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONFIG_PATH = join(ROOT, 'catalog.config.json')

/**
 * @returns {{ topN: number, excludeIds: number[], configPath: string }}
 */
export async function loadCatalogConfig() {
  const raw = await readFile(CONFIG_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const topN = Math.max(1, Number(parsed.topN) || 1000)
  const excludeIds = Array.isArray(parsed.excludeIds)
    ? parsed.excludeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : []
  return { topN, excludeIds, configPath: CONFIG_PATH }
}

export function topExportFileName(topN) {
  return `top-${topN}.json`
}
