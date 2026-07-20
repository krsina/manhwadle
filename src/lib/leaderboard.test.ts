import { describe, expect, it } from 'vitest'
import {
  assignOrdinalRanks,
  assignOrdinalRanksFromValues,
  clampLeaderboardLimit,
  compareLeaderboardRows,
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  isAfterLeaderboardCursor,
  parseLeaderboardPage,
  sortLeaderboardEntries,
} from './leaderboard'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import { DEFAULT_STAGE_ID } from './avatarStages'

describe('clampLeaderboardLimit', () => {
  it('defaults and caps', () => {
    expect(clampLeaderboardLimit(undefined)).toBe(25)
    expect(clampLeaderboardLimit(0)).toBe(1)
    expect(clampLeaderboardLimit(1000)).toBe(100)
    expect(clampLeaderboardLimit(40)).toBe(40)
  })
})

describe('assignOrdinalRanks', () => {
  it('assigns unique ranks with first-achieved then publicId tiebreaks', () => {
    const ranked = assignOrdinalRanksFromValues([
      { value: 10, publicId: 'b', achievedAtMs: 200 },
      { value: 10, publicId: 'a', achievedAtMs: 100 },
      { value: 8, publicId: 'c', achievedAtMs: 50 },
      { value: 7, publicId: 'e', achievedAtMs: 10 },
      { value: 7, publicId: 'd', achievedAtMs: 10 },
    ])
    expect(ranked.map((r) => ({ rank: r.rank, publicId: r.publicId }))).toEqual([
      { rank: 1, publicId: 'a' },
      { rank: 2, publicId: 'b' },
      { rank: 3, publicId: 'c' },
      { rank: 4, publicId: 'd' },
      { rank: 5, publicId: 'e' },
    ])
  })

  it('falls back to publicId when achieved times match', () => {
    const sorted = sortLeaderboardEntries([
      { value: 5, publicId: 'z', achievedAtMs: 1 },
      { value: 5, publicId: 'm', achievedAtMs: 1 },
    ])
    expect(sorted.map((r) => r.publicId)).toEqual(['m', 'z'])
    expect(assignOrdinalRanks(sorted).map((r) => r.rank)).toEqual([1, 2])
  })
})

describe('leaderboard cursors', () => {
  it('round-trips opaque keyset payloads', () => {
    const encoded = encodeLeaderboardCursor({
      v: 2,
      board: 'current_streak',
      value: 12,
      t: '2026-07-20T12:00:00.000Z',
      p: '00000000-0000-4000-8000-000000000001',
    })
    expect(decodeLeaderboardCursor(encoded)).toEqual({
      v: 2,
      board: 'current_streak',
      value: 12,
      t: '2026-07-20T12:00:00.000Z',
      p: '00000000-0000-4000-8000-000000000001',
    })
    expect(decodeLeaderboardCursor('%%%')).toBeNull()
  })

  it('rejects legacy v1 cursors', () => {
    const legacy = utf8ToBase64(
      JSON.stringify({
        v: 1,
        board: 'current_streak',
        value: 12,
        u: 'alice',
        p: 'pub_1',
      }),
    )
    expect(decodeLeaderboardCursor(legacy)).toBeNull()
  })

  it('orders keyset after cursor deterministically', () => {
    const cursor = {
      v: 2 as const,
      board: 'longest_streak' as const,
      value: 10,
      t: '2026-07-20T10:00:00.000Z',
      p: 'p2',
    }
    expect(
      isAfterLeaderboardCursor(
        { value: 10, t: '2026-07-20T10:00:00.000Z', p: 'p2' },
        cursor,
      ),
    ).toBe(false)
    expect(
      isAfterLeaderboardCursor({ value: 9, t: '2026-07-01T00:00:00.000Z', p: 'p0' }, cursor),
    ).toBe(true)
    expect(
      isAfterLeaderboardCursor(
        { value: 10, t: '2026-07-20T11:00:00.000Z', p: 'p0' },
        cursor,
      ),
    ).toBe(true)
    expect(
      compareLeaderboardRows(
        { value: 5, t: '2026-01-01T00:00:00.000Z', p: '1' },
        { value: 5, t: '2026-01-02T00:00:00.000Z', p: '1' },
      ),
    ).toBeLessThan(0)
  })
})

describe('parseLeaderboardPage', () => {
  it('parses public-safe rows and rejects uuid leakage', () => {
    const page = parseLeaderboardPage({
      board: 'all_mode_streak',
      entries: [
        {
          rank: 1,
          username: 'Neo',
          value: 4,
          public_id: 'p_neo',
          equipped_avatar_id: 'avatar_shadow_hunter',
          equipped_stage_id: 'stage_dusk_plaza',
        },
        { rank: 2, username: 'Trinity', value: 3, public_id: 'p_tr' },
      ],
      next_cursor: 'abc',
      has_more: true,
    })
    expect(page?.entries).toHaveLength(2)
    expect(page?.entries[0]?.equippedAvatarId).toBe('avatar_shadow_hunter')
    expect(page?.entries[0]?.equippedStageId).toBe('stage_dusk_plaza')
    expect(page?.entries[1]?.equippedAvatarId).toBe(DEFAULT_AVATAR_ID)
    expect(page?.entries[1]?.equippedStageId).toBe(DEFAULT_STAGE_ID)
    expect(page?.nextCursor).toBe('abc')

    expect(
      parseLeaderboardPage({
        board: 'current_streak',
        entries: [
          {
            rank: 1,
            username: 'Neo',
            value: 4,
            public_id: 'p_neo',
            user_id: '00000000-0000-0000-0000-000000000001',
          },
        ],
      }),
    ).toBeNull()
  })
})

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}
