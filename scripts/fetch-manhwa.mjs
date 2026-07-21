/**
 * Fetches the top 250 Korean manhwa from AniList and writes src/data/manhwa.json
 * Usage: npm run fetch-data
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePublisher } from './lib/publisher.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'manhwa.json')
const ENDPOINT = 'https://graphql.anilist.co'
const TOTAL = 250
const PER_PAGE = 50
const TAG_MIN_RANK = 60

const QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
      currentPage
    }
    media(
      type: MANGA
      countryOfOrigin: "KR"
      sort: POPULARITY_DESC
      isAdult: false
    ) {
      id
      title {
        english
        romaji
        native
      }
      synonyms
      description(asHtml: false)
      genres
      status(version: 2)
      startDate {
        year
        month
        day
      }
      coverImage {
        large
      }
      tags {
        name
        rank
        isMediaSpoiler
      }
      siteUrl
    }
  }
}
`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripHtml(text) {
  if (!text) return ''
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function mapStatus(status) {
  // AniList MediaStatus (status version 2 includes HIATUS)
  switch (status) {
    case 'RELEASING':
      return 'Ongoing'
    case 'FINISHED':
      return 'Completed'
    case 'HIATUS':
      return 'Hiatus'
    case 'CANCELLED':
      return 'Cancelled'
    case 'NOT_YET_RELEASED':
      return 'Not yet released'
    default:
      return status ?? 'Unknown'
  }
}

function normalizeEntry(media) {
  const tags = (media.tags ?? [])
    .filter((t) => !t.isMediaSpoiler && (t.rank ?? 0) >= TAG_MIN_RANK)
    .map((t) => t.name)

  return {
    id: media.id,
    title: {
      english: media.title?.english ?? null,
      romaji: media.title?.romaji ?? null,
      native: media.title?.native ?? null,
    },
    synonyms: media.synonyms ?? [],
    description: stripHtml(media.description),
    genres: media.genres ?? [],
    tags,
    status: mapStatus(media.status),
    publisher: resolvePublisher(media.id, media.description),
    startDate: {
      year: media.startDate?.year ?? null,
      month: media.startDate?.month ?? null,
      day: media.startDate?.day ?? null,
    },
    coverImage: media.coverImage?.large ?? null,
    siteUrl: media.siteUrl ?? `https://anilist.co/manga/${media.id}`,
  }
}

async function fetchPage(page, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { page, perPage: PER_PAGE },
    }),
  })

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 60)
    if (attempt >= 5) {
      throw new Error(`Rate limited on page ${page} after ${attempt} attempts`)
    }
    console.warn(`Rate limited. Waiting ${retryAfter}s (attempt ${attempt})...`)
    await sleep(retryAfter * 1000)
    return fetchPage(page, attempt + 1)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`AniList HTTP ${res.status}: ${body}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(`AniList GraphQL error: ${JSON.stringify(json.errors)}`)
  }

  return json.data.Page
}

async function main() {
  const collected = []
  const pagesNeeded = Math.ceil(TOTAL / PER_PAGE)

  console.log(`Fetching top ${TOTAL} Korean manhwa from AniList...`)

  for (let page = 1; page <= pagesNeeded; page++) {
    const data = await fetchPage(page)
    const batch = (data.media ?? []).map(normalizeEntry)
    collected.push(...batch)
    console.log(`  Page ${page}/${pagesNeeded}: +${batch.length} (total ${collected.length})`)

    if (page < pagesNeeded) {
      await sleep(1100)
    }
  }

  const unique = []
  const seen = new Set()
  for (const entry of collected) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    unique.push(entry)
    if (unique.length >= TOTAL) break
  }

  if (unique.length < TOTAL) {
    console.warn(`Warning: only got ${unique.length} unique entries (wanted ${TOTAL})`)
  }

  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(unique, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${unique.length} entries to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
