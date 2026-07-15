import type { Manhwa } from '../lib/anilist-types'
import type {
  StoryDescriptionBlurbEntry,
  StoryDescriptionBlurbFile,
  StoryDescriptionBlurbTiers,
} from '../lib/blurbs'
import type { CharacterCropEntry, CharacterCropFile } from '../lib/crops'

/** Joined manhwa + blurb + crop rows used by the library editor. */
export interface LibraryRecord {
  manhwa: Manhwa
  blurb: StoryDescriptionBlurbEntry | null
  /** Per-character (and legacy manhwa-level) crop overrides */
  crops: CharacterCropEntry[]
}

export interface LibrarySavePayload {
  manhwa: Manhwa[]
  blurbs: StoryDescriptionBlurbFile
  crops: CharacterCropFile
}

/** Flat blurb rows ready for a relational `manhwa_blurb` table. */
export interface DbBlurbRow {
  manhwa_id: number
  blurb_type: string
  tier: string
  text: string
  rank: number | null
  title: string | null
}

/** Flat crop rows ready for a relational `manhwa_character_crop` table. */
export interface DbCropRow {
  manhwa_id: number
  image_url: string
  focus_x: number
  focus_y: number
  character_name: string | null
  character_id: number | null
  rank: number | null
  title: string | null
}

export interface DbExportDocument {
  exportedAt: string
  format: 'manhwadle-relational-v1'
  manhwa: Manhwa[]
  blurbs: DbBlurbRow[]
  character_crops: DbCropRow[]
}

export function displayName(manhwa: Manhwa): string {
  return (
    manhwa.title.english?.trim() ||
    manhwa.title.romaji?.trim() ||
    manhwa.title.native?.trim() ||
    `Untitled #${manhwa.id}`
  )
}

export function emptyTiers(): StoryDescriptionBlurbTiers {
  return { t0: '', t1: '' }
}

export function cloneManhwa(manhwa: Manhwa): Manhwa {
  const clone = structuredClone(manhwa)
  clone.characters = (clone.characters || []).map((character) => ({
    ...character,
    // Default every cast member into the Character-mode pool
    useForGuess: character.useForGuess !== false,
  }))
  return clone
}

export function cloneBlurb(
  entry: StoryDescriptionBlurbEntry | null,
  manhwa: Manhwa,
): StoryDescriptionBlurbEntry {
  if (entry) return structuredClone(entry)
  return {
    manhwaId: manhwa.id,
    title: displayName(manhwa),
    storyDescriptionBlurb: emptyTiers(),
  }
}

export function emptyCrop(manhwa: Manhwa, characterId?: number): CharacterCropEntry {
  return {
    manhwaId: manhwa.id,
    title: displayName(manhwa),
    imageUrl: '',
    focusX: 50,
    focusY: 28,
    characterId,
  }
}
