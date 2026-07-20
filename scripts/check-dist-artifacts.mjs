/**
 * Assert production dist contains only the player app — no tool HTML/JSON.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')

const FORBIDDEN_NAME_FRAGMENTS = [
  'library',
  'character-image',
  'character-images',
  'unmatched-top1000',
  'verify',
]

const budgets = {
  /** Initial main JS entry (uncompressed). */
  entryJsBytes: 400_000,
  /** Largest non-catalog JS chunk. */
  largestJsBytes: 450_000,
  /** Compact catalog JSON chunk. */
  catalogJsonBytes: 2_800_000,
  /** Sum of all JS excluding catalog JSON payloads. */
  totalJsWithoutCatalogBytes: 1_500_000,
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error('dist/ missing — run npm run build first')
    process.exit(1)
  }

  const files = walk(dist)
  const relative = files.map((f) => path.relative(dist, f).replace(/\\/g, '/'))

  const leaks = relative.filter((name) => {
    const lower = name.toLowerCase()
    return FORBIDDEN_NAME_FRAGMENTS.some((frag) => lower.includes(frag))
  })
  if (leaks.length) {
    console.error('Forbidden tool/audit artifacts in dist:', leaks)
    process.exit(1)
  }

  if (!relative.includes('index.html')) {
    console.error('dist/index.html missing')
    process.exit(1)
  }

  const assets = files.filter((f) => f.includes(`${path.sep}assets${path.sep}`))
  let totalJs = 0
  let totalJsWithoutCatalog = 0
  let largestJs = 0
  let largestJsName = ''
  let entryJs = 0
  let catalogBytes = 0

  for (const file of assets) {
    const size = fs.statSync(file).size
    const base = path.basename(file)
    const isCatalog =
      /client-catalog|manhwa/i.test(base) ||
      (file.endsWith('.js') && size > 1_000_000)

    if (isCatalog || (/client-catalog/i.test(base) && file.endsWith('.js'))) {
      catalogBytes = Math.max(catalogBytes, size)
    }

    if (file.endsWith('.js')) {
      totalJs += size
      if (!isCatalog) {
        totalJsWithoutCatalog += size
        if (size > largestJs) {
          largestJs = size
          largestJsName = path.relative(dist, file)
        }
      }
      if (/^main-.*\.js$/i.test(base)) entryJs = size
    }
  }

  // Prefer explicit catalog chunk name when present.
  const catalogFile = files.find((f) => /client-catalog/i.test(path.basename(f)))
  if (catalogFile) catalogBytes = fs.statSync(catalogFile).size

  const report = {
    fileCount: relative.length,
    entryJsBytes: entryJs,
    largestJsBytes: largestJs,
    largestJs: largestJsName,
    catalogBytes,
    totalJsBytes: totalJs,
    totalJsWithoutCatalogBytes: totalJsWithoutCatalog,
    budgets,
  }

  const failures = []
  if (entryJs > budgets.entryJsBytes) {
    failures.push(`entry JS ${entryJs} > ${budgets.entryJsBytes}`)
  }
  if (largestJs > budgets.largestJsBytes) {
    failures.push(`largest JS ${largestJs} > ${budgets.largestJsBytes} (${largestJsName})`)
  }
  if (catalogBytes > budgets.catalogJsonBytes) {
    failures.push(`catalog ${catalogBytes} > ${budgets.catalogJsonBytes}`)
  }
  if (totalJsWithoutCatalog > budgets.totalJsWithoutCatalogBytes) {
    failures.push(
      `total JS without catalog ${totalJsWithoutCatalog} > ${budgets.totalJsWithoutCatalogBytes}`,
    )
  }

  console.log(JSON.stringify(report, null, 2))
  if (failures.length) {
    console.error('Budget failures:', failures)
    process.exit(1)
  }
  console.log('dist artifact checks passed')
}

main()
