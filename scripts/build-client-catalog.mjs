/**
 * Build a compact player-facing catalog from src/data/manhwa.json.
 * Keeps only fields used at runtime; strips character descriptions,
 * favourites, redundant image sizes, and unused date parts.
 * Joins AniList popularity rank from storyDescriptionBlurb.json.
 *
 * Source ETL / manhwa.json remain untouched.
 *
 * Usage: node scripts/build-client-catalog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourcePath = path.join(root, 'src/data/manhwa.json')
const blurbPath = path.join(root, 'src/data/storyDescriptionBlurb.json')
const outPath = path.join(root, 'src/data/client-catalog.json')

/** @typedef {import('../src/lib/anilist-types').Manhwa} Manhwa */

function loadRankById() {
  const raw = JSON.parse(fs.readFileSync(blurbPath, 'utf8'))
  /** @type {Map<number, number>} */
  const ranks = new Map()
  for (const entry of raw.entries || []) {
    const id = Number(entry.manhwaId)
    const rank = Number(entry.rank)
    if (Number.isFinite(id) && Number.isFinite(rank) && rank > 0) {
      ranks.set(id, rank)
    }
  }
  return ranks
}

function compactCharacter(character) {
  const imageUrl = character?.image?.large || character?.image?.medium || null
  /** @type {Record<string, unknown>} */
  const next = {
    id: character.id,
    role: character.role,
    name: {
      full: character.name?.full ?? null,
      native: character.name?.native ?? null,
      alternative: Array.isArray(character.name?.alternative)
        ? character.name.alternative.filter(Boolean)
        : [],
    },
    image: { large: imageUrl, medium: null },
    siteUrl: character.siteUrl ?? null,
    description: null,
    favourites: null,
  }
  if (character.useForGuess === false) next.useForGuess = false
  return next
}

function compactTitle(title, rankById) {
  const rank = rankById.get(title.id) ?? null
  /** @type {Record<string, unknown>} */
  const next = {
    id: title.id,
    title: {
      english: title.title?.english ?? null,
      romaji: title.title?.romaji ?? null,
      native: title.title?.native ?? null,
    },
    synonyms: Array.isArray(title.synonyms) ? title.synonyms.filter(Boolean) : [],
    description: typeof title.description === 'string' ? title.description : '',
    genres: Array.isArray(title.genres) ? title.genres : [],
    tags: Array.isArray(title.tags) ? title.tags : [],
    status: title.status ?? 'Unknown',
    publisher: title.publisher ?? '',
    startDate: {
      year: title.startDate?.year ?? null,
      month: null,
      day: null,
    },
    coverImage: title.coverImage ?? null,
    siteUrl: title.siteUrl ?? '',
    characters: Array.isArray(title.characters)
      ? title.characters.map(compactCharacter)
      : [],
  }
  if (rank != null) next.rank = rank
  return next
}

function main() {
  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  if (!Array.isArray(raw)) {
    throw new Error('manhwa.json must be an array')
  }
  const rankById = loadRankById()
  const compact = raw.map((title) => compactTitle(title, rankById))
  const missingRank = compact.filter((title) => title.rank == null).length
  const payload = `${JSON.stringify(compact)}\n`
  fs.writeFileSync(outPath, payload, 'utf8')

  const fullBytes = fs.statSync(sourcePath).size
  const compactBytes = Buffer.byteLength(payload)
  console.log(
    `client-catalog: ${compact.length} titles, ${missingRank} missing rank, ` +
      `${(compactBytes / 1024 / 1024).toFixed(2)} MiB ` +
      `(from ${(fullBytes / 1024 / 1024).toFixed(2)} MiB manhwa.json)`,
  )
}

main()
