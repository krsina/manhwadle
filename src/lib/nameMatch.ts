/**
 * Loose name/title matching: hyphens, spaces, and punctuation are ignored so
 * "Mo-Ri Jin", "Mo Ri Jin", and "Mori Jin" all compare equal.
 *
 * English possessives (`'s` / `’s`) are optional so "Doctor's Rebirth" matches
 * "doctor rebirth" as well as "doctor's rebirth".
 *
 * Two-token Latin names also match in either order so Korean given/family
 * flips work: "Seol Kang" ≡ "Kang Seol".
 */

const LATIN_TOKEN = /^[\p{Script=Latin}][\p{Script=Latin}.'’\-]*$/u

/** Straight or curly apostrophe + s used as an English possessive. */
const POSSESSIVE_S = /['\u2018\u2019]s\b/gi

/** Compact key for equality / prefix / substring scoring. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/gi, '')
}

function stripPossessive(value: string): string {
  return value.replace(POSSESSIVE_S, '')
}

/**
 * Compact keys for a display string, including a possessive-stripped variant.
 * "Doctor's Rebirth" → ["doctorsrebirth", "doctorrebirth"].
 */
export function normalizeSearchKeys(value: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const form of [value, stripPossessive(value)]) {
    const key = normalizeSearchKey(form)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
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
      .flatMap(normalizeSearchKeys)
      .filter(Boolean),
  )
  return nameOrderVariants(a).some((variant) =>
    normalizeSearchKeys(variant).some((key) => right.has(key)),
  )
}

function scoreCompactKey(
  nameKey: string,
  queryKey: string,
  allowSubstring: boolean,
): number {
  if (nameKey === queryKey) return 0
  if (nameKey.startsWith(queryKey)) return 1
  if (allowSubstring && nameKey.includes(queryKey)) return 2
  return Infinity
}

/**
 * Rank how well `name` matches an already-normalized query key.
 * 0 exact, 1 prefix, 2 substring, Infinity no match.
 * Considers name-order variants (exact "kangseol" vs stored "Seol Kang") and
 * optional English possessives.
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
    for (const n of normalizeSearchKeys(variant)) {
      best = Math.min(best, scoreCompactKey(n, queryKey, allowSubstring))
      if (best === 0) return 0
    }
  }
  return best
}

/**
 * Strong autocomplete match against a single display form (no order expansion).
 * 0 exact, 1 prefix, Infinity otherwise — substring hits are excluded.
 */
export function scoreStrongSearchKey(name: string, queryKey: string): number {
  if (!queryKey) return Infinity
  let best = Infinity
  for (const n of normalizeSearchKeys(name)) {
    if (n === queryKey) return 0
    if (n.startsWith(queryKey)) best = Math.min(best, 1)
  }
  return best
}
