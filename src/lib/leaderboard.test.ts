import { describe, expect, it } from 'vitest'
import {
  assignDenseRanks,
  clampLeaderboardLimit,
  compareLeaderboardRows,
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  isAfterLeaderboardCursor,
  parseLeaderboardPage,
} from './leaderboard'

describe('clampLeaderboardLimit', () => {
  it('defaults and caps', () => {
    expect(clampLeaderboardLimit(undefined)).toBe(25)
    expect(clampLeaderboardLimit(0)).toBe(1)
    expect(clampLeaderboardLimit(1000)).toBe(100)
    expect(clampLeaderboardLimit(40)).toBe(40)
  })
})

describe('assignDenseRanks', () => {
  it('shares rank on ties without gaps', () => {
    const ranked = assignDenseRanks([
      { value: 10, name: 'a' },
      { value: 10, name: 'b' },
      { value: 8, name: 'c' },
      { value: 7, name: 'd' },
      { value: 7, name: 'e' },
    ])
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 2, 3, 3])
  })
})

describe('leaderboard cursors', () => {
  it('round-trips opaque keyset payloads', () => {
    const encoded = encodeLeaderboardCursor({
      v: 1,
      board: 'current_streak',
      value: 12,
      u: 'alice',
      p: 'pub_1',
    })
    expect(decodeLeaderboardCursor(encoded)).toEqual({
      v: 1,
      board: 'current_streak',
      value: 12,
      u: 'alice',
      p: 'pub_1',
    })
    expect(decodeLeaderboardCursor('%%%')).toBeNull()
  })

  it('orders keyset after cursor deterministically', () => {
    const cursor = {
      v: 1 as const,
      board: 'longest_streak' as const,
      value: 10,
      u: 'bob',
      p: 'p2',
    }
    expect(
      isAfterLeaderboardCursor({ value: 10, u: 'bob', p: 'p2' }, cursor),
    ).toBe(false)
    expect(
      isAfterLeaderboardCursor({ value: 9, u: 'aaa', p: 'p0' }, cursor),
    ).toBe(true)
    expect(
      isAfterLeaderboardCursor({ value: 10, u: 'carl', p: 'p3' }, cursor),
    ).toBe(true)
    expect(
      compareLeaderboardRows(
        { value: 5, u: 'a', p: '1' },
        { value: 5, u: 'a', p: '2' },
      ),
    ).toBeLessThan(0)
  })
})

describe('parseLeaderboardPage', () => {
  it('parses public-safe rows and rejects uuid leakage', () => {
    const page = parseLeaderboardPage({
      board: 'all_mode_streak',
      entries: [
        { rank: 1, username: 'Neo', value: 4, public_id: 'p_neo' },
        { rank: 2, username: 'Trinity', value: 3, public_id: 'p_tr' },
      ],
      next_cursor: 'abc',
      has_more: true,
    })
    expect(page?.entries).toHaveLength(2)
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
