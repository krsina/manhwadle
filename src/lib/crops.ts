/**
 * Character-crop mode: zoomed character stills for daily Character mode.
 * Crops are optionally stored per AniList character; otherwise the default
 * AniList portrait is used with a neutral focus point.
 */

import {
  characterImageUrl,
  isCharacterEnabledForGuess,
  type Manhwa,
  type ManhwaCharacter,
} from './anilist-types'
import { characterDisplayName } from './characterNames'
import { hashString } from './daily'

export interface CharacterCropEntry {
  manhwaId: number
  rank?: number
  title?: string
  /** Full URL or site-relative path to the character still */
  imageUrl: string
  /** Horizontal focus for the initial crop (0–100) */
  focusX: number
  /** Vertical focus for the initial crop (0–100) */
  focusY: number
  /** Optional label for editors only — never shown in-game */
  characterName?: string
  /** AniList character id this crop belongs to */
  characterId?: number
}

export interface CharacterCropFile {
  meta?: {
    version?: number
    mode?: string
    count?: number
    generatedAt?: string
    notes?: string[]
  }
  entries: CharacterCropEntry[]
}

/**
 * Zoom scale after N failed guesses (higher = tighter crop).
 * Playable steps after ZOOM_START_OFFSET must cover maxGuesses (6) and
 * land on 1× by the last guess (failedGuesses === 5).
 */
const ZOOM_LADDER = [
  5.2,
  3.8, // skipped by ZOOM_START_OFFSET
  2.9, // guess 1 (0 fails)
  2.3, // guess 2
  1.85, // guess 3
  1.5, // guess 4
  1.22, // guess 5
  1, // last guess — full portrait
] as const

/**
 * Skip the tightest ladder steps so the opening clue is less extreme.
 * 0 = start at 5.2×; 2 = start at 2.9× (two steps zoomed out).
 */
const ZOOM_START_OFFSET = 2

/** Number of progressive zoom steps (one per guess, ending at full reveal). */
export const CROP_ZOOM_STEPS = ZOOM_LADDER.length - ZOOM_START_OFFSET

export function cropKey(manhwaId: number, characterId: number): string {
  return `${manhwaId}:${characterId}`
}

/** Index crops by manhwaId (may contain multiple character-specific entries). */
export function groupCropsByManhwa(
  doc: CharacterCropFile,
): Map<number, CharacterCropEntry[]> {
  const map = new Map<number, CharacterCropEntry[]>()
  for (const entry of doc.entries || []) {
    if (entry.manhwaId == null || !entry.imageUrl?.trim()) continue
    const list = map.get(entry.manhwaId) || []
    list.push(entry)
    map.set(entry.manhwaId, list)
  }
  return map
}

/** Index by manhwaId → first crop (legacy single-crop lookups). */
export function indexCharacterCrops(
  doc: CharacterCropFile,
): Map<number, CharacterCropEntry> {
  const map = new Map<number, CharacterCropEntry>()
  for (const entry of doc.entries || []) {
    if (entry.manhwaId == null || !entry.imageUrl?.trim()) continue
    if (!map.has(entry.manhwaId)) map.set(entry.manhwaId, entry)
  }
  return map
}

/** Index by `${manhwaId}:${characterId}` for per-character crops. */
export function indexCropsByCharacter(
  doc: CharacterCropFile,
): Map<string, CharacterCropEntry> {
  const map = new Map<string, CharacterCropEntry>()
  for (const entry of doc.entries || []) {
    if (entry.manhwaId == null || entry.characterId == null) continue
    if (!entry.imageUrl?.trim()) continue
    map.set(cropKey(entry.manhwaId, entry.characterId), entry)
  }
  return map
}

export function findCharacterCrop(
  crops: CharacterCropEntry[],
  characterId: number,
): CharacterCropEntry | null {
  return crops.find((crop) => crop.characterId === characterId) || null
}

/** Characters opted into Character mode that have an image. */
export function guessableCharacters(manhwa: Manhwa): ManhwaCharacter[] {
  return (manhwa.characters || []).filter(
    (character) =>
      isCharacterEnabledForGuess(character) && Boolean(characterImageUrl(character)),
  )
}

export function manhwaHasGuessableCharacter(manhwa: Manhwa): boolean {
  return guessableCharacters(manhwa).length > 0
}

/**
 * Pick today's character still for a manhwa from enabled cast members.
 * Prefers a saved per-character crop when present.
 */
export function resolveDailyCharacterCrop(
  manhwa: Manhwa,
  dateKey: string,
  seedPrefix: string,
  cropsForManhwa: CharacterCropEntry[] = [],
): CharacterCropEntry | null {
  const eligible = guessableCharacters(manhwa)

  if (eligible.length > 0) {
    const index =
      hashString(`${seedPrefix}-char-${dateKey}-${manhwa.id}`) % eligible.length
    const character = eligible[index]!
    const saved =
      findCharacterCrop(cropsForManhwa, character.id) ||
      cropsForManhwa.find((c) => !c.characterId) ||
      null
    const imageUrl =
      saved?.imageUrl?.trim() || characterImageUrl(character) || null
    if (!imageUrl) return null

    return {
      manhwaId: manhwa.id,
      title: manhwa.title.english || undefined,
      characterId: character.id,
      characterName: characterDisplayName(character),
      imageUrl,
      focusX: saved ? clampFocus(saved.focusX) : 50,
      focusY: saved ? clampFocus(saved.focusY, 28) : 28,
    }
  }

  const fallback = cropsForManhwa.find((c) => c.imageUrl?.trim())
  return fallback || null
}

export function cropZoomScale(
  failedGuesses: number,
  { finished = false }: { finished?: boolean } = {},
): number {
  if (finished) return 1
  const index = Math.min(
    Math.max(0, failedGuesses) + ZOOM_START_OFFSET,
    ZOOM_LADDER.length - 1,
  )
  return ZOOM_LADDER[index]!
}

export function clampFocus(value: number | null | undefined, fallback = 50): number {
  if (value == null || Number.isNaN(value)) return fallback
  return Math.min(100, Math.max(0, value))
}
