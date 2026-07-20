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

function loadSongs() {
  try {
    const doc = JSON.parse(
      readFileSync(join(__dirname, '../../src/data/songs.json'), 'utf8'),
    )
    return doc.songs || []
  } catch {
    return []
  }
}

const SONGS = loadSongs()

export function manhwaHasVocalSong(manhwa) {
  return VOCAL_SONG_MANHWA_IDS.has(manhwa.id)
}

/** Match app_private.normalize_bonus_guess_label (a-z0-9 only). */
export function normalizeBonusGuessLabel(label) {
  if (label == null) return null
  const normalized = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return normalized || null
}

function loadProtagonistOverrides() {
  try {
    const doc = JSON.parse(
      readFileSync(join(__dirname, '../../src/data/protagonists.json'), 'utf8'),
    )
    return new Map(
      Object.entries(doc.protagonists || {}).map(([manhwaId, characterId]) => [
        Number(manhwaId),
        Number(characterId),
      ]),
    )
  } catch {
    return new Map()
  }
}

const PROTAGONIST_BY_MANHWA = loadProtagonistOverrides()

function characterNameParts(character) {
  const names = [
    character?.name?.full,
    character?.name?.native,
    ...(character?.name?.alternative || []),
  ].filter((name) => typeof name === 'string' && name.trim())
  return [...new Set(names.map((n) => n.trim()))]
}

/**
 * Private server-validation fields for bonus-name rewards.
 * Stripped from public get_daily_play_state meta.
 */
export function buildBonusNameMeta(manhwa) {
  const mains = guessableCharacters(manhwa, { mainOnly: true })
  if (mains.length === 0) return null

  const preferredId = PROTAGONIST_BY_MANHWA.get(manhwa.id)
  const bonus =
    (preferredId != null ? mains.find((c) => c.id === preferredId) : null) ||
    mains[0]
  if (!bonus) return null

  const aliases = characterNameParts(bonus)
  const normalized = normalizeBonusGuessLabel(aliases[0] || '')
  if (!normalized && aliases.length === 0) return null

  return {
    bonus_character_id: bonus.id,
    bonus_name_normalized: normalized,
    bonus_name_aliases: aliases,
  }
}

function answerFingerprint(manhwa) {
  return {
    genres: [...(manhwa.genres || [])],
    tags: [...(manhwa.tags || [])],
    status: manhwa.status || 'Unknown',
    publisher: manhwa.publisher || '',
    year: manhwa.startDate?.year ?? null,
  }
}

function blurbIndex(input) {
  if (input instanceof Set) return new Map([...input].map((id) => [id, null]))
  return new Map(
    (input?.entries || []).map((entry) => [
      entry.manhwaId,
      entry.storyDescriptionBlurb || null,
    ]),
  )
}

function cropIndex(input) {
  const map = new Map()
  const entries = Array.isArray(input?.entries) ? input.entries : []
  for (const entry of entries) {
    const list = map.get(entry.manhwaId) || []
    list.push(entry)
    map.set(entry.manhwaId, list)
  }
  return map
}

function characterClues(manhwa, crops) {
  return guessableCharacters(manhwa, { mainOnly: true })
    .map((character) => {
      const crop =
        (crops || []).find((entry) => entry.characterId === character.id) ||
        (crops || []).find((entry) => entry.characterId == null)
      const imageUrl = crop?.imageUrl?.trim() || characterImageUrl(character)
      if (!imageUrl) return null
      return {
        character_id: character.id,
        image_url: imageUrl,
        focus_x: Number.isFinite(crop?.focusX) ? crop.focusX : 50,
        focus_y: Number.isFinite(crop?.focusY) ? crop.focusY : 28,
      }
    })
    .filter(Boolean)
}

function heardleClues(manhwa) {
  return SONGS.filter(
    (song) => song?.manhwaId === manhwa.id && song.kind === 'vocal',
  ).map((song) => ({
    id: song.id,
    youtube_id: song.youtubeId,
    start_sec: song.startSec ?? 0,
    kind: song.kind,
    source: song.source,
  }))
}

export function buildPoolEntryMeta(mode, manhwa, authored, crops) {
  const bonus = buildBonusNameMeta(manhwa)
  const meta = {
    answer_fingerprint: answerFingerprint(manhwa),
  }

  if (mode === 'character') {
    const clues = characterClues(manhwa, crops)
    if (clues.length > 0) meta.character_clues = clues
  } else if (mode === 'summary') {
    const blurbs = [
      authored?.t0,
      authored?.t1,
      manhwa.description,
    ].filter((value) => typeof value === 'string' && value.trim())
    if (blurbs.length > 0) {
      meta.public_clue = { type: 'summary', blurbs }
    }
  } else if (mode === 'cover') {
    if (manhwa.coverImage?.trim()) {
      meta.public_clue = {
        type: 'cover',
        image_url: manhwa.coverImage.trim(),
        focus_x: 50,
        focus_y: 35,
      }
    }
  } else if (mode === 'heardle') {
    const clues = heardleClues(manhwa)
    if (clues.length > 0) meta.heardle_clues = clues
  }

  if (bonus) Object.assign(meta, bonus)
  return meta
}

export function buildRows(manhwa, blurbs, crops = { entries: [] }) {
  const authoredById = blurbIndex(blurbs)
  const cropsById = cropIndex(crops)
  const rows = []
  for (const mode of MODES) {
    for (const taste of TASTES) {
      const tastePool = filterPoolByTaste(manhwa, taste)
      let playable
      if (mode === 'summary') {
        playable = tastePool.filter((m) => authoredById.has(m.id))
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
        rows.push({
          mode,
          taste,
          position,
          manhwa_id: m.id,
          character_id: null,
          meta: buildPoolEntryMeta(
            mode,
            m,
            authoredById.get(m.id),
            cropsById.get(m.id),
          ),
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
