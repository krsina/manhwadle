import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasRealCharacterImage } from '../../scripts/lib/character-image.mjs'
import {
  MODES,
  TASTES,
  buildRows,
  manhwaHasCover,
  manhwaHasGuessableCharacter,
} from '../../scripts/lib/puzzle-pools.mjs'
import { CATALOG_EXCLUDE_IDS, CATALOG_SIZE, CATALOG_TOP_N } from '../lib/catalogConfig'
import {
  characterImageUrl,
  type Manhwa,
} from '../lib/anilist-types'
import { guessableCharacters } from '../lib/crops'
import { filterPoolByTaste } from '../lib/readerTaste'
import type { CharacterCropFile } from '../lib/crops'
import type { StoryDescriptionBlurbFile } from '../lib/blurbs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const manhwa = JSON.parse(
  readFileSync(join(root, 'src/data/manhwa.json'), 'utf8'),
) as Manhwa[]
const blurbs = JSON.parse(
  readFileSync(join(root, 'src/data/storyDescriptionBlurb.json'), 'utf8'),
) as StoryDescriptionBlurbFile
const crops = JSON.parse(
  readFileSync(join(root, 'src/data/characterCrop.json'), 'utf8'),
) as CharacterCropFile

const TYRANT_ID = 153513
const CROWN_ID = 319508
const TYRANT_WIKI_IDS = [
  319501, 319502, 319504, 319505, 319507, 319509, 319510, 319511, 319512, 319513,
]

describe('catalog invariants', () => {
  it(`has exactly ${CATALOG_SIZE} titles (topN=${CATALOG_TOP_N} minus ${CATALOG_EXCLUDE_IDS.length} exclusions)`, () => {
    expect(manhwa).toHaveLength(CATALOG_SIZE)
  })

  it('does not include catalog excludeIds', () => {
    const ids = new Set(manhwa.map((m) => m.id))
    for (const id of CATALOG_EXCLUDE_IDS) {
      expect(ids.has(id), `excluded id ${id} should be absent`).toBe(false)
    }
  })

  it('every title has a non-empty publisher string', () => {
    for (const title of manhwa) {
      expect(typeof title.publisher).toBe('string')
      expect(title.publisher.trim().length).toBeGreaterThan(0)
    }
  })

  it('never nests AniList default.jpg placeholders on characters', () => {
    for (const title of manhwa) {
      for (const character of title.characters || []) {
        expect(
          hasRealCharacterImage(character),
          `${title.id}/${character.id} should have a real image`,
        ).toBe(true)
        expect(characterImageUrl(character)).toBeTruthy()
      }
    }
  })

  it('every guessable character has a resolvable image URL', () => {
    for (const title of manhwa) {
      for (const character of guessableCharacters(title)) {
        expect(characterImageUrl(character)).toBeTruthy()
      }
    }
  })

  it('character-mode eligibility matches guessables or crop entries', () => {
    const cropIds = new Set((crops.entries || []).map((e) => e.manhwaId))
    for (const title of manhwa) {
      const playable =
        manhwaHasGuessableCharacter(title) || cropIds.has(title.id)
      if (playable) {
        expect(
          guessableCharacters(title).length > 0 || cropIds.has(title.id),
        ).toBe(true)
      }
    }
  })

  it('all blurb manhwaIds resolve in the catalog and each taste has summary playables', () => {
    const byId = new Map(manhwa.map((m) => [m.id, m]))
    const blurbIds = new Set((blurbs.entries || []).map((e) => e.manhwaId))
    for (const id of blurbIds) {
      expect(byId.has(id), `blurb for missing manhwa ${id}`).toBe(true)
    }
    for (const taste of TASTES) {
      const tastePool = filterPoolByTaste(manhwa, taste)
      const playable = tastePool.filter((m) => blurbIds.has(m.id))
      expect(playable.length, `summary playables for ${taste}`).toBeGreaterThan(0)
    }
  })

  it('titles with coverImage pass manhwaHasCover', () => {
    for (const title of manhwa) {
      if (title.coverImage) {
        expect(manhwaHasCover(title)).toBe(true)
      }
    }
  })

  it('Tyrant wiki fills are present and Crown is omitted', () => {
    const tyrant = manhwa.find((m) => m.id === TYRANT_ID)
    expect(tyrant).toBeTruthy()
    const byId = new Map((tyrant!.characters || []).map((c) => [c.id, c]))
    expect(byId.has(CROWN_ID)).toBe(false)
    for (const id of TYRANT_WIKI_IDS) {
      const character = byId.get(id)
      expect(character, `missing Tyrant character ${id}`).toBeTruthy()
      const url = characterImageUrl(character!) || ''
      expect(
        /wikia\.nocookie\.net|fandom\.com/i.test(url),
        `Tyrant ${id} should use wiki host: ${url}`,
      ).toBe(true)
    }
  })

  it('rebuilds 9 non-empty puzzle pool lanes with eligible character titles only', () => {
    const blurbIds = new Set((blurbs.entries || []).map((e) => e.manhwaId))
    const cropIds = new Set((crops.entries || []).map((e) => e.manhwaId))
    const rows = buildRows(manhwa, blurbIds, cropIds)

    expect(MODES).toHaveLength(3)
    expect(TASTES).toHaveLength(3)

    for (const mode of MODES) {
      for (const taste of TASTES) {
        const lane = rows.filter((r) => r.mode === mode && r.taste === taste)
        expect(lane.length, `${mode}/${taste}`).toBeGreaterThan(0)
      }
    }

    const characterRows = rows.filter((r) => r.mode === 'character')
    for (const row of characterRows) {
      const title = manhwa.find((m) => m.id === row.manhwa_id)
      expect(title).toBeTruthy()
      expect(
        manhwaHasGuessableCharacter(title!) || cropIds.has(row.manhwa_id),
      ).toBe(true)
      if (row.meta?.eligible_character_ids) {
        const eligible = new Set(guessableCharacters(title!).map((c) => c.id))
        for (const id of row.meta.eligible_character_ids as number[]) {
          expect(eligible.has(id)).toBe(true)
        }
      }
    }
  })
})
