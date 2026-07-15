/**
 * Scrape https://asurascans.com/browse?page=1..17 and match vs top-N pool.
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

function matchKeys(s) {
  const n = norm(s)
  const keys = new Set([n])
  if (n.startsWith('the ')) keys.add(n.slice(4))
  else if (n) keys.add(`the ${n}`)
  return keys
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function isJunkTitle(t) {
  const s = t.trim()
  if (!s || s.length < 3) return true
  if (/^\d+$/.test(s)) return true
  return /^(asura scans|browse series|dmca|privacy policy|terms of service|home|login|discord|comics?|manga|series)$/i.test(
    s,
  )
}

function slugToTitle(slug) {
  return decodeURIComponent(slug)
    .replace(/\/$/, '')
    .split('/')
    .pop()
    .replace(/-\d+$/, '')
    .replace(/-/g, ' ')
    .trim()
}

async function fetchBrowse(page) {
  const url =
    page <= 1
      ? 'https://asurascans.com/browse'
      : `https://asurascans.com/browse?page=${page}`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  const text = await res.text()
  return { status: res.status, url: res.url, text }
}

function extractFromHtml(html) {
  const titles = new Map() // norm -> display

  const add = (raw) => {
    const t = decodeEntities(String(raw || '').trim())
    if (isJunkTitle(t)) return
    const key = norm(t)
    if (!key || titles.has(key)) return
    titles.set(key, t)
  }

  for (const re of [
    /href="\/series\/([^"?#]+)"/gi,
    /href="\/manga\/([^"?#]+)"/gi,
    /href="\/title\/([^"?#]+)"/gi,
    /href="https?:\/\/asurascans\.com\/series\/([^"?#]+)"/gi,
  ]) {
    for (const m of html.matchAll(re)) add(slugToTitle(m[1]))
  }

  for (const re of [
    /"name"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g,
    /"title"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g,
    /"post_title"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g,
  ]) {
    for (const m of html.matchAll(re)) {
      let t = m[1]
      try {
        t = JSON.parse(`"${t}"`)
      } catch {
        t = t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
          String.fromCharCode(Number.parseInt(h, 16)),
        )
      }
      add(t)
    }
  }

  // card headings
  for (const m of html.matchAll(/<(?:h[1-4]|a)[^>]*>\s*([^<]{3,160})\s*<\/(?:h[1-4]|a)>/gi)) {
    add(m[1])
  }

  return titles
}

const { topN } = await loadCatalogConfig()
// Prefer game catalog (includes merged synonyms / title-aliases)
const manhwaPath = join(ROOT, 'src', 'data', 'manhwa.json')
const pool = JSON.parse(await readFile(manhwaPath, 'utf8'))

const poolByNorm = new Map()
for (const m of pool) {
  for (const n of [
    m.title?.english,
    m.title?.romaji,
    m.title?.native,
    ...(m.synonyms || []),
  ].filter(Boolean)) {
    for (const k of matchKeys(n)) {
      if (k && !poolByNorm.has(k)) poolByNorm.set(k, m)
    }
  }
}

const allTitles = new Map()
const pageStats = []

for (let page = 1; page <= 17; page++) {
  const { status, url, text } = await fetchBrowse(page)
  const found = extractFromHtml(text)
  let added = 0
  for (const [k, v] of found) {
    if (!allTitles.has(k)) {
      allTitles.set(k, v)
      added++
    }
  }
  pageStats.push({ page, status, finalUrl: url, extracted: found.size, newUnique: added })
  console.error(
    `page ${page}: status=${status} extracted=${found.size} new=${added} totalUnique=${allTitles.size}`,
  )
  if (page === 1) {
    await writeFile(join(ROOT, 'scripts', 'asura-browse-p1-sample.html'), text.slice(0, 200_000))
  }
  await new Promise((r) => setTimeout(r, 250))
}

const matched = []
const missing = []
for (const [, title] of allTitles) {
  let hit = null
  for (const k of matchKeys(title)) {
    hit = poolByNorm.get(k)
    if (hit) break
  }
  if (hit) {
    matched.push({
      asuraTitle: title,
      anilistId: hit.id,
      anilistTitle:
        typeof hit.title === 'string'
          ? hit.title
          : hit.title?.english || hit.title?.romaji || null,
      popularity: hit.popularity ?? null,
      rank: hit.rank ?? null,
    })
  } else {
    missing.push(title)
  }
}

matched.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
missing.sort((a, b) => a.localeCompare(b))

const report = {
  source: 'https://asurascans.com/browse?page=1..17',
  topN,
  pages: pageStats,
  totalUniqueTitles: allTitles.size,
  matched: matched.length,
  missing: missing.length,
  coveragePct: allTitles.size
    ? Math.round((matched.length / allTitles.size) * 1000) / 10
    : 0,
  missingTitles: missing,
  matchedSample: matched.slice(0, 30),
}

await writeFile(
  join(ROOT, 'scripts', 'asura-coverage-report.json'),
  JSON.stringify(report, null, 2),
)

console.log(
  JSON.stringify(
    {
      totalUniqueTitles: report.totalUniqueTitles,
      matched: report.matched,
      missing: report.missing,
      coveragePct: report.coveragePct,
      pagesOk: pageStats.filter((p) => p.status === 200).length,
      missingSample: missing.slice(0, 50),
      page1Extracted: pageStats[0],
    },
    null,
    2,
  ),
)
