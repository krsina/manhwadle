/**
 * Coverage check: publisher catalogs vs top-N pool.
 * Uses MangaDex for Flame/Hive; scrapes Asura series slugs from asuracomic.net.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCatalogConfig, topExportFileName } from './catalog-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function mdGet(path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch('https://api.mangadex.org' + path, {
      headers: { 'User-Agent': 'manhwadle-coverage-check/1.0' },
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`${path} ${res.status}`)
    return res.json()
  }
  throw new Error(`rate limited ${path}`)
}

function titlesFromManga(m) {
  const out = new Set()
  for (const v of Object.values(m.attributes?.title || {})) if (v) out.add(String(v))
  for (const obj of m.attributes?.altTitles || []) {
    for (const v of Object.values(obj)) if (v) out.add(String(v))
  }
  return [...out]
}

async function listGroupManga(groupId) {
  const items = []
  let offset = 0
  const limit = 100
  while (true) {
    const data = await mdGet(
      `/manga?limit=${limit}&offset=${offset}&group=${groupId}&availableTranslatedLanguage[]=en`,
    )
    for (const m of data.data || []) {
      items.push({
        mdId: m.id,
        primary:
          m.attributes?.title?.en ||
          Object.values(m.attributes?.title || {})[0] ||
          null,
        allTitles: titlesFromManga(m),
      })
    }
    offset += limit
    if (offset >= (data.total || 0) || !(data.data || []).length) break
    await new Promise((r) => setTimeout(r, 250))
  }
  return items
}

async function crawlAsuraSlugs() {
  const titles = new Set()
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`https://asuracomic.net/series?page=${page}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) break
    const html = await res.text()
    const before = titles.size
    for (const m of html.matchAll(/href="\/series\/([^"?]+)"/g)) {
      const slug = decodeURIComponent(m[1])
      const pretty = slug.replace(/-\d+$/, '').replace(/-/g, ' ').trim()
      if (pretty.length > 2) titles.add(pretty)
    }
    // embedded next data names
    for (const m of html.matchAll(/"name":"([^"]{2,160})"/g)) {
      const t = m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(Number.parseInt(h, 16)),
      )
      if (!/Asura|Series|Home|Login|Discord|Popular|Trending/i.test(t)) titles.add(t)
    }
    console.error(`asura page ${page}: ${titles.size} (+${titles.size - before})`)
    if (titles.size === before && page > 2) break
    await new Promise((r) => setTimeout(r, 200))
  }
  return [...titles]
}

async function crawlHiveSlugs() {
  const titles = new Set()
  const bases = ['https://hivetoon.com', 'https://hivetoons.org']
  for (const base of bases) {
    for (let page = 1; page <= 40; page++) {
      const url = `${base}/series?page=${page}`
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      })
      if (!res.ok) {
        console.error(url, res.status)
        break
      }
      const html = await res.text()
      const before = titles.size
      for (const m of html.matchAll(/href="\/(?:series|manga|comic)\/([^"?]+)"/g)) {
        const slug = decodeURIComponent(m[1])
        const pretty = slug.replace(/-\d+$/, '').replace(/-/g, ' ').trim()
        if (pretty.length > 2) titles.add(pretty)
      }
      for (const m of html.matchAll(/"name":"([^"]{2,160})"/g)) {
        const t = m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
          String.fromCharCode(Number.parseInt(h, 16)),
        )
        if (!/Hive|Series|Home|Login|Discord|Popular/i.test(t)) titles.add(t)
      }
      console.error(`hive ${base} page ${page}: ${titles.size}`)
      if (titles.size === before && page > 2) break
      await new Promise((r) => setTimeout(r, 200))
    }
    if (titles.size > 30) break
  }
  return [...titles]
}

function buildPoolIndex(pool) {
  const map = new Map()
  for (const m of pool) {
    const names = [
      m.title,
      m.titles?.english,
      m.titles?.romaji,
      m.titles?.native,
      ...(m.aliases || []),
    ].filter(Boolean)
    for (const n of names) {
      const k = norm(n)
      if (k && !map.has(k)) map.set(k, m)
    }
  }
  return map
}

function matchTitle(poolByNorm, titles) {
  for (const t of titles) {
    const hit = poolByNorm.get(norm(t))
    if (hit) return hit
  }
  return null
}

const { topN } = await loadCatalogConfig()
const topPath = join(ROOT, 'manhwadle-etl', 'output', topExportFileName(topN))
const top = JSON.parse(await readFile(topPath, 'utf8'))
const pool = top.manhwa || []
const poolByNorm = buildPoolIndex(pool)
const least = pool.reduce((a, b) =>
  (a.popularity ?? 0) <= (b.popularity ?? 0) ? a : b,
)

const FLAME = 'f91b5324-9151-466d-9758-1081aeee8c4d'
const HIVE = 'c364e1d0-2dc7-48db-b47f-0977f4e70912'

console.error('MangaDex Flame...')
const flameItems = await listGroupManga(FLAME)
console.error('MangaDex Hive Scans...')
const hiveMdItems = await listGroupManga(HIVE)
console.error('Crawl Asura...')
const asuraTitles = await crawlAsuraSlugs()
console.error('Crawl HiveToon site...')
const hiveSiteTitles = await crawlHiveSlugs()

function summarizeMd(items) {
  const matched = []
  const missing = []
  for (const item of items) {
    const hit = matchTitle(poolByNorm, item.allTitles)
    if (hit) {
      matched.push({
        siteTitle: item.primary,
        anilistId: hit.id,
        anilistTitle: hit.title,
        popularity: hit.popularity,
        rank: hit.rank,
      })
    } else missing.push(item.primary)
  }
  return { total: items.length, matched: matched.length, missing: missing.length, missingTitles: missing, matched }
}

function summarizeTitles(titles) {
  const matched = []
  const missing = []
  for (const t of titles) {
    const hit = matchTitle(poolByNorm, [t])
    if (hit) {
      matched.push({
        siteTitle: t,
        anilistId: hit.id,
        anilistTitle: hit.title,
        popularity: hit.popularity,
        rank: hit.rank,
      })
    } else missing.push(t)
  }
  return { total: titles.length, matched: matched.length, missing: missing.length, missingTitles: missing, matched }
}

const flame = summarizeMd(flameItems)
const hiveMd = summarizeMd(hiveMdItems)
const asura = summarizeTitles(asuraTitles)
const hiveSite = summarizeTitles(hiveSiteTitles)

const report = {
  methodNotes: [
    'Flame + Hive Scans: MangaDex group catalogs (English available).',
    'Asura: scraped series slugs from asuracomic.net (MangaDex Asura group returned empty/blocked).',
    'HiveToons: no exact MangaDex group; used Hive Scans on MD + hivetoon.com crawl.',
    'Matching is normalized title/alias equality against top-N AniList export — false misses possible for odd romanizations.',
  ],
  pool: {
    topN,
    size: pool.length,
    leastPopular: {
      title: least.title,
      popularity: least.popularity,
      rank: least.rank,
      id: least.id,
      siteUrl: least.siteUrl,
    },
  },
  asura,
  flame,
  hiveScansMangaDex: hiveMd,
  hiveToonSiteCrawl: hiveSite,
}

await writeFile(
  join(ROOT, 'scripts', 'publisher-coverage-report.json'),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify({
  poolLeastPopular: report.pool.leastPopular,
  asura: { total: asura.total, matched: asura.matched, missing: asura.missing, missingSample: asura.missingTitles.slice(0, 40) },
  flame: { total: flame.total, matched: flame.matched, missing: flame.missing, missingTitles: flame.missingTitles },
  hiveScansMangaDex: { total: hiveMd.total, matched: hiveMd.matched, missing: hiveMd.missing, missingTitles: hiveMd.missingTitles },
  hiveToonSite: { total: hiveSite.total, matched: hiveSite.matched, missing: hiveSite.missing, missingSample: hiveSite.missingTitles.slice(0, 40) },
}, null, 2))
