/**
 * Shared puzzle-pool eligibility + row builder (used by sync-puzzle-pools + tests).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODES = ['summary', 'character', 'cover', 'heardle']
export const TASTES = ['action', 'romance', 'both']

const ACTION_GENRES = new Set([
  'Action',
  'Fantasy',
  'Adventure',
  'Thriller',
  'Horror',
  'Sports',
  'Sci-Fi',
])
const ROMANCE_GENRES = new Set(['Romance', 'Drama', 'Slice of Life'])
const ACTION_TAGS = new Set([
  'Martial Arts',
  'Isekai',
  'Reincarnation',
  'Revenge',
  'Dungeon',
  'Cultivation',
  'Gore',
  'Survival',
  'Swordplay',
  'Demons',
  'Super Power',
  'War',
  'Male Protagonist',
  'Anti-Hero',
  'Age Regression',
  'Virtual World',
  'Video Games',
  'Necromancy',
  'Wuxia',
])
const ROMANCE_TAGS = new Set([
  'Villainess',
  'Love Triangle',
  'School',
  'Royal Affairs',
  'Family Life',
  'Otome Game',
  'Female Protagonist',
  'Heterosexual',
  'Ojou-sama',
  'Yandere',
  'Coming of Age',
  'Found Family',
  'Work',
])

const FEMININE_TAGS = new Set([
  'Villainess',
  'Otome Game',
  'Female Protagonist',
  'Ojou-sama',
  'Love Triangle',
  'Royal Affairs',
  'Male Harem',
])

const OTOME_TAGS = new Set([
  'Villainess',
  'Otome Game',
  'Ojou-sama',
  'Male Harem',
  'Royal Affairs',
])

const __dirname = dirname(fileURLToPath(import.meta.url))
const overrideDoc = JSON.parse(
  readFileSync(join(__dirname, '../../src/data/tasteLaneOverrides.json'), 'utf8'),
)
const LANE_OVERRIDES = new Map(
  Object.entries(overrideDoc.lanes || {}).map(([id, lane]) => [Number(id), lane]),
)

function scoreSide(manhwa, genres, tags) {
  let score = 0
  for (const genre of manhwa.genres || []) {
    if (genres.has(genre)) score += 3
  }
  for (const tag of manhwa.tags || []) {
    if (tags.has(tag)) score += 1
  }
  return score
}

function hasGenre(manhwa, genre) {
  return (manhwa.genres || []).some((g) => g === genre)
}

function hasAnyTag(manhwa, tags) {
  return (manhwa.tags || []).some((t) => tags.has(t))
}

/** Otome / princess-romance before Fantasy/Isekai inflate the action score. */
function isFeminineRomanceTitle(manhwa) {
  if (!hasGenre(manhwa, 'Romance')) return false
  if (hasAnyTag(manhwa, OTOME_TAGS)) return true
  const femaleLead = hasAnyTag(manhwa, new Set(['Female Protagonist']))
  const maleLead = hasAnyTag(manhwa, new Set(['Male Protagonist']))
  if (femaleLead && !maleLead) return true
  if (hasGenre(manhwa, 'Fantasy') && !hasGenre(manhwa, 'Action')) return true
  return false
}

function breakTasteTie(manhwa) {
  if (isFeminineRomanceTitle(manhwa)) return 'romance'
  const hasRomance = hasGenre(manhwa, 'Romance')
  const hasAction = hasGenre(manhwa, 'Action')
  const hasFantasy = hasGenre(manhwa, 'Fantasy')
  const feminine = hasAnyTag(manhwa, FEMININE_TAGS)
  const maleLead = hasAnyTag(manhwa, new Set(['Male Protagonist']))
  const femaleLead = hasAnyTag(manhwa, new Set(['Female Protagonist']))

  if (hasRomance && (feminine || (hasFantasy && !hasAction))) return 'romance'
  if (hasAction && !hasRomance) return 'action'
  if (hasAction && maleLead && !femaleLead) return 'action'
  if (hasFantasy && hasRomance) return 'romance'
  if (hasAction || maleLead) return 'action'
  if (hasRomance || feminine) return 'romance'
  return 'both'
}

export function classifyManhwaTaste(manhwa) {
  const override = LANE_OVERRIDES.get(manhwa.id)
  if (override === 'action' || override === 'romance' || override === 'both') {
    return override
  }

  if (isFeminineRomanceTitle(manhwa)) return 'romance'

  const action = scoreSide(manhwa, ACTION_GENRES, ACTION_TAGS)
  const romance = scoreSide(manhwa, ROMANCE_GENRES, ROMANCE_TAGS)
  if (action === 0 && romance === 0) return breakTasteTie(manhwa)
  if (action === romance) return breakTasteTie(manhwa)
  return action > romance ? 'action' : 'romance'
}

export function manhwaMatchesTaste(manhwa, taste) {
  if (taste === 'both') return true
  const lane = classifyManhwaTaste(manhwa)
  return lane === taste || lane === 'both'
}

export function filterPoolByTaste(pool, taste) {
  if (taste === 'both') return pool
  const filtered = pool.filter((m) => manhwaMatchesTaste(m, taste))
  return filtered.length > 0 ? filtered : pool
}

function characterImageUrl(character) {
  return character.image?.large || character.image?.medium || null
}

function isCharacterEnabledForGuess(character) {
  return character.useForGuess !== false
}

/**
 * Cast members eligible for Character mode.
 * `mainOnly` matches client normal-mode play (AniList MAIN roles).
 */
export function guessableCharacters(manhwa, { mainOnly = false } = {}) {
  return (manhwa.characters || []).filter((c) => {
    if (!isCharacterEnabledForGuess(c) || !characterImageUrl(c)) return false
    if (mainOnly && c.role !== 'MAIN') return false
    return true
  })
}

export function manhwaHasGuessableCharacter(manhwa, options) {
  return guessableCharacters(manhwa, options).length > 0
}

export function manhwaHasCover(manhwa) {
  return Boolean(manhwa.coverImage?.trim())
}

function loadVocalSongManhwaIds() {
  try {
    const doc = JSON.parse(
      readFileSync(join(__dirname, '../../src/data/songs.json'), 'utf8'),
    )
    const ids = new Set()
    for (const song of doc.songs || []) {
      if (song?.kind === 'vocal' && Number.isFinite(song.manhwaId)) {
        ids.add(Number(song.manhwaId))
      }
    }
    return ids
  } catch {
    return new Set()
  }
}

const VOCAL_SONG_MANHWA_IDS = loadVocalSongManhwaIds()

export function manhwaHasVocalSong(manhwa) {
  return VOCAL_SONG_MANHWA_IDS.has(manhwa.id)
}

export function buildRows(manhwa, blurbIds, _cropIds = new Set()) {
  const rows = []
  for (const mode of MODES) {
    for (const taste of TASTES) {
      const tastePool = filterPoolByTaste(manhwa, taste)
      let playable
      if (mode === 'summary') {
        playable = tastePool.filter((m) => blurbIds.has(m.id))
        if (playable.length === 0) playable = tastePool
      } else if (mode === 'character') {
        // Normal Character mode requires MAIN cast with images (hard mode
        // still uses the same titles, then expands roles client-side).
        // Crop-file-only titles without MAIN are not playable.
        playable = tastePool.filter((m) =>
          manhwaHasGuessableCharacter(m, { mainOnly: true }),
        )
      } else if (mode === 'heardle') {
        playable = tastePool.filter(manhwaHasVocalSong)
      } else {
        playable = tastePool.filter(manhwaHasCover)
      }

      playable.forEach((m, position) => {
        const eligible =
          mode === 'character'
            ? guessableCharacters(m, { mainOnly: true }).map((c) => c.id)
            : []
        rows.push({
          mode,
          taste,
          position,
          manhwa_id: m.id,
          character_id: null,
          meta:
            mode === 'character' && eligible.length > 0
              ? { eligible_character_ids: eligible }
              : null,
        })
      })
    }
  }
  return rows
}

export function rowsToSql(rows) {
  const values = rows
    .map((r) => {
      const meta =
        r.meta == null ? 'null' : `'${JSON.stringify(r.meta).replace(/'/g, "''")}'::jsonb`
      return `('${r.mode}','${r.taste}',${r.position},${r.manhwa_id},null,${meta})`
    })
    .join(',\n')
  return `-- Generated by scripts/sync-puzzle-pools.mjs
truncate public.puzzle_pool_entries;
insert into public.puzzle_pool_entries
  (mode, taste, position, manhwa_id, character_id, meta)
values
${values};
select public.ensure_daily_puzzles();
`
}
