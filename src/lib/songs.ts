import songsDoc from '../data/songs.json'
import type { Manhwa } from './anilist-types'
import { hashString } from './daily'

export type SongKind = 'vocal' | 'bgm'
export type SongSource = 'webtoon_ost' | 'anime' | 'drama' | 'film'

export interface ManhwaSong {
  id: string
  manhwaId: number
  songTitle: string
  artist?: string
  kind: SongKind
  source: SongSource
  youtubeId: string
  startSec?: number
}

const songs = (songsDoc.songs ?? []) as ManhwaSong[]

export function listSongs(): ManhwaSong[] {
  return songs
}

export function songsForManhwa(
  manhwaId: number,
  options?: { includeBgm?: boolean },
): ManhwaSong[] {
  const includeBgm = options?.includeBgm ?? false
  return songs.filter(
    (s) => s.manhwaId === manhwaId && (includeBgm || s.kind === 'vocal'),
  )
}

export function manhwaHasSongs(
  manhwa: Manhwa,
  options?: { includeBgm?: boolean },
): boolean {
  return songsForManhwa(manhwa.id, options).length > 0
}

/** Unique manhwa ids that have at least one eligible song. */
export function songManhwaIds(options?: { includeBgm?: boolean }): Set<number> {
  const includeBgm = options?.includeBgm ?? false
  const ids = new Set<number>()
  for (const s of songs) {
    if (includeBgm || s.kind === 'vocal') ids.add(s.manhwaId)
  }
  return ids
}

export function filterPoolBySongs(
  pool: Manhwa[],
  options?: { includeBgm?: boolean },
): Manhwa[] {
  const ids = songManhwaIds(options)
  return pool.filter((m) => ids.has(m.id))
}

/**
 * Deterministic daily/practice song pick for a manhwa (vocals only).
 */
export function pickSongForDay(
  manhwaId: number,
  dateKey: string,
  seedPrefix: string,
): ManhwaSong | null {
  const candidates = songsForManhwa(manhwaId, { includeBgm: false })
  if (candidates.length === 0) return null
  const index =
    hashString(`${seedPrefix}:song:${manhwaId}:${dateKey}`) % candidates.length
  return candidates[index]!
}

/** Progressive clip length in seconds by failed-guess count (0 = first listen). */
export const HEARDLE_CLIP_SECONDS = [2, 4, 7, 11, 16, 22] as const

export function clipSecondsForGuesses(
  failedGuesses: number,
  maxGuesses: number,
): number {
  const idx = Math.min(
    Math.max(0, failedGuesses),
    HEARDLE_CLIP_SECONDS.length - 1,
    Math.max(0, maxGuesses - 1),
  )
  return HEARDLE_CLIP_SECONDS[idx]!
}

export function songSourceLabel(source: SongSource, kind: SongKind): string {
  if (kind === 'bgm') return 'BGM'
  switch (source) {
    case 'webtoon_ost':
      return 'Webtoon OST'
    case 'anime':
    case 'drama':
      // Don't spoil whether the clip is from an anime or drama adaptation.
      return 'OST'
    case 'film':
      return 'Film OST'
    default:
      return 'OST'
  }
}
