/** Pick a random index in pool, optionally avoiding a manhwa id. */
export function randomPlayableIndex(pool: { id: number }[], avoidId?: number): number {
  if (pool.length === 0) return 0
  if (pool.length === 1) return 0
  let next = Math.floor(Math.random() * pool.length)
  if (avoidId != null && pool[next]?.id === avoidId) {
    next = (next + 1) % pool.length
  }
  return next
}
