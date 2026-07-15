import { describe, expect, it } from 'vitest'
import { getDailyAnswer, getDailyIndex, hashString } from './daily'
import { makeManhwa } from './testFixtures'

describe('daily seeding', () => {
  it('hashString is stable for a fixed input', () => {
    expect(hashString('seed-2026-07-15')).toBe(hashString('seed-2026-07-15'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('getDailyIndex wraps within pool size', () => {
    const index = getDailyIndex('2026-07-15', 10, 'summary')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(10)
    expect(getDailyIndex('2026-07-15', 0, 'summary')).toBe(0)
  })

  it('getDailyAnswer is deterministic for fixed seed and date', () => {
    const pool = [1, 2, 3, 4, 5].map((id) => makeManhwa({ id }))
    const a = getDailyAnswer(pool, '2026-07-15', 'character-action')
    const b = getDailyAnswer(pool, '2026-07-15', 'character-action')
    expect(a.id).toBe(b.id)
    expect(pool.map((m) => m.id)).toContain(a.id)
  })
})
