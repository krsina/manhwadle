/**
 * Build src/data/protagonists.json — one lead character id per title.
 *
 * Default: first MAIN in AniList RELEVANCE/appearance order (from ETL catalog).
 * Overrides: curated fixes where RELEVANCE ranks a co-lead ahead of the POV lead.
 *
 * Usage: node scripts/build-protagonists.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/** manhwaId → characterId when AniList relevance order is wrong for the POV lead */
const OVERRIDES = {
  113055: 173730, // The Remarried Empress → Navier Trobi
  107521: 143632, // Who Made Me a Princess → Athanasia
  123573: 187471, // Lout of Count's Family → Cale Henituse
  59983: 48967, // Noblesse → Cadis Etrama di Raizel
  121991: 193869, // Viral Hit → Ho-Bin Yu
  113488: 180787, // Weak Hero → Si-Eun Yeon
  114542: 159252, // Your Throne → Medea Belial
  129210: 207021, // Roxana → Roxana Agriche
  86099: 137282, // Wind Breaker → Ja-Hyeon Jo
  172619: 342786, // The Extra's Academy Survival Guide → Ed Rothstaylor
  130149: 277632, // Villain to Kill → Cassian Lee
}

async function main() {
  const catalog = JSON.parse(
    await readFile(join(ROOT, 'manhwadle-etl/output/catalog.json'), 'utf8'),
  )
  const game = JSON.parse(await readFile(join(ROOT, 'src/data/manhwa.json'), 'utf8'))

  const mainsByManhwa = new Map()
  for (const app of catalog.appearances || []) {
    if (app.role !== 'MAIN') continue
    const list = mainsByManhwa.get(app.manhwaId) || []
    list.push(app.characterId)
    mainsByManhwa.set(app.manhwaId, list)
  }

  /** @type {Record<string, number>} */
  const protagonists = {}
  let fromAppearance = 0
  let fromOverride = 0
  let fromGameFallback = 0
  let missing = 0

  for (const manhwa of game) {
    const gameMainIds = new Set(
      (manhwa.characters || [])
        .filter((c) => c.role === 'MAIN')
        .map((c) => c.id),
    )
    if (gameMainIds.size === 0) {
      missing++
      continue
    }

    const overrideId = OVERRIDES[manhwa.id]
    if (overrideId != null && gameMainIds.has(overrideId)) {
      protagonists[String(manhwa.id)] = overrideId
      fromOverride++
      continue
    }

    const appearanceMains = mainsByManhwa.get(manhwa.id) || []
    const fromApp = appearanceMains.find((id) => gameMainIds.has(id))
    if (fromApp != null) {
      protagonists[String(manhwa.id)] = fromApp
      fromAppearance++
      continue
    }

    // Fallback: first MAIN still attached in the game catalog
    protagonists[String(manhwa.id)] = [...gameMainIds][0]
    fromGameFallback++
  }

  const outPath = join(ROOT, 'src/data/protagonists.json')
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'AniList RELEVANCE appearance order + curated overrides',
      counts: {
        titles: Object.keys(protagonists).length,
        fromAppearance,
        fromOverride,
        fromGameFallback,
        noMain: missing,
      },
    },
    overrides: OVERRIDES,
    protagonists,
  }

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${outPath}`)
  console.log(payload.meta.counts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
