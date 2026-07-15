/**
 * Loose name/title matching: hyphens, spaces, and punctuation are ignored so
 * "Mo-Ri Jin", "Mo Ri Jin", and "Mori Jin" all compare equal.
 */

/** Compact key for equality / prefix / substring scoring. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/gi, '')
}

/** True when two display names match under compact normalization. */
export function namesMatch(a: string, b: string): boolean {
  const left = normalizeSearchKey(a)
  const right = normalizeSearchKey(b)
  return Boolean(left) && left === right
}

/**
 * Rank how well `name` matches an already-normalized query key.
 * 0 exact, 1 prefix, 2 substring, Infinity no match.
 */
export function scoreSearchKey(name: string, queryKey: string): number {
  if (!queryKey) return Infinity
  const n = normalizeSearchKey(name)
  if (!n) return Infinity
  if (n === queryKey) return 0
  if (n.startsWith(queryKey)) return 1
  if (n.includes(queryKey)) return 2
  return Infinity
}
