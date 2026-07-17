/**
 * Loose name/title matching: hyphens, spaces, and punctuation are ignored so
 * "Mo-Ri Jin", "Mo Ri Jin", and "Mori Jin" all compare equal.
 *
 * Two-token Latin names also match in either order so Korean given/family
 * flips work: "Seol Kang" ≡ "Kang Seol".
 */

const LATIN_TOKEN = /^[\p{Script=Latin}][\p{Script=Latin}.'’\-]*$/u

/** Compact key for equality / prefix / substring scoring. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/gi, '')
}

/**
 * Display forms of a name for matching/search.
 * Two-token Latin names include the reversed order ("Seol Kang" → also "Kang Seol").
 */
export function nameOrderVariants(name: string): string[] {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) return []

  const parts = trimmed.split(' ')
  if (parts.length !== 2 || !parts.every((part) => LATIN_TOKEN.test(part))) {
    return [trimmed]
  }

  const swapped = `${parts[1]} ${parts[0]}`
  if (normalizeSearchKey(swapped) === normalizeSearchKey(trimmed)) {
    return [trimmed]
  }
  return [trimmed, swapped]
}

/** True when two display names match under compact normalization (incl. name order). */
export function namesMatch(a: string, b: string): boolean {
  const right = new Set(
    nameOrderVariants(b)
      .map(normalizeSearchKey)
      .filter(Boolean),
  )
  return nameOrderVariants(a).some((variant) => {
    const key = normalizeSearchKey(variant)
    return Boolean(key) && right.has(key)
  })
}

/**
 * Rank how well `name` matches an already-normalized query key.
 * 0 exact, 1 prefix, 2 substring, Infinity no match.
 * Considers name-order variants (exact "kangseol" vs stored "Seol Kang").
 *
 * Substring hits are opt-in so short autocomplete queries can stay prefix-only.
 */
export function scoreSearchKey(
  name: string,
  queryKey: string,
  options?: { allowSubstring?: boolean },
): number {
  if (!queryKey) return Infinity

  const allowSubstring = options?.allowSubstring ?? true
  let best = Infinity
  for (const variant of nameOrderVariants(name)) {
    const n = normalizeSearchKey(variant)
    if (!n) continue
    if (n === queryKey) return 0
    if (n.startsWith(queryKey)) best = Math.min(best, 1)
    else if (allowSubstring && n.includes(queryKey)) best = Math.min(best, 2)
  }
  return best
}

/**
 * Strong autocomplete match against a single display form (no order expansion).
 * 0 exact, 1 prefix, Infinity otherwise — substring hits are excluded.
 */
export function scoreStrongSearchKey(name: string, queryKey: string): number {
  if (!queryKey) return Infinity
  const n = normalizeSearchKey(name)
  if (!n) return Infinity
  if (n === queryKey) return 0
  if (n.startsWith(queryKey)) return 1
  return Infinity
}
