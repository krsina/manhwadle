import { describe, expect, it } from 'vitest'
import {
  clipSecondsForGuesses,
  filterPoolBySongs,
  listSongs,
  manhwaHasSongs,
  pickSongForDay,
  songManhwaIds,
  songsForManhwa,
} from './songs'

describe('songs catalog', () => {
  it('has a playable seed of vocal tracks', () => {
    const all = listSongs()
    expect(all.length).toBeGreaterThanOrEqual(40)
    const vocals = all.filter((s) => s.kind === 'vocal')
    expect(vocals.length).toBeGreaterThanOrEqual(30)
    const bgm = all.filter((s) => s.kind === 'bgm')
    expect(bgm.length).toBeGreaterThanOrEqual(5)
  })

  it('maps Study Group DIE DIE', () => {
    const songs = songsForManhwa(110472, { includeBgm: false })
    expect(songs.some((s) => /die die/i.test(s.songTitle))).toBe(true)
  })

  it('hard mode includes BGM candidates', () => {
    const vocalOnly = songsForManhwa(105398, { includeBgm: false })
    const withBgm = songsForManhwa(105398, { includeBgm: true })
    expect(withBgm.length).toBeGreaterThan(vocalOnly.length)
  })

  it('filters pools by song coverage', () => {
    const pool = [
      { id: 110472 },
      { id: 1 },
      { id: 105398 },
    ] as { id: number }[]
    const filtered = filterPoolBySongs(pool as never)
    expect(filtered.map((m) => m.id).sort()).toEqual([105398, 110472])
  })

  it('picks songs deterministically', () => {
    const a = pickSongForDay(105398, '2026-07-17', 'manhwadle:heardle:both', false)
    const b = pickSongForDay(105398, '2026-07-17', 'manhwadle:heardle:both', false)
    expect(a?.id).toBe(b?.id)
    expect(a?.kind).toBe('vocal')
  })

  it('extends clip length with failed guesses', () => {
    expect(clipSecondsForGuesses(0, 6)).toBe(2)
    expect(clipSecondsForGuesses(5, 6)).toBe(22)
  })

  it('song manhwa id set is non-empty', () => {
    expect(songManhwaIds().size).toBeGreaterThan(10)
    expect(manhwaHasSongs({ id: 110472 } as never)).toBe(true)
  })
})
