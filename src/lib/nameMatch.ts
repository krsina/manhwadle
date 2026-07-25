/**
 * Loose name/title matching: hyphens, spaces, and punctuation are ignored so
 * "Mo-Ri Jin", "Mo Ri Jin", and "Mori Jin" all compare equal.
 *
 * English possessives (`'s` / `’s`) are optional so "Doctor's Rebirth" matches
 * "doctor rebirth" as well as "doctor's rebirth".
 *
 * Two-token Latin names also match in either order so Korean given/family
 * flips work: "Seol Kang" ≡ "Kang Seol".
 *
 * Common English function words (a/the/of/…) are optional in a secondary
 * compact key so "Tale of the scribe…" still hits "Tale of a Scribe…".
 */

const LATIN_TOKEN = /^[\p{Script=Latin}][\p{Script=Latin}.'’\-]*$/u

/** Straight or curly apostrophe + s used as an English possessive. */
const POSSESSIVE_S = /['\u2018\u2019]s\b/gi

/**
 * Scripts kept after compaction: Latin, digits, Hangul (syllables + jamo),
 * Kana, CJK ideographs, and Thai.
 *
 * NFKD decomposes Hangul syllables into jamo — those jamo ranges must stay
 * allowlisted or native titles like "낙향문사전" normalize to "".
 */
const KEEP_CHARS =
  /[^a-z0-9\u0e00-\u0e7f\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]+/g

/** Split raw titles/queries into searchable tokens (punctuation → boundaries). */
const TOKEN_SPLIT =
  /[^a-z0-9\u0e00-\u0e7f\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]+/

/** Short English glue words ignored in the loose compact key. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'who',
  'that',
  'is',
  'as',
  'at',
  'by',
  'from',
  'with',
  'into',
  'onto',
])

/** Compact key for equality / prefix / substring scoring. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(KEEP_CHARS, '')
}

function stripPossessive(value: string): string {
  return value.replace(POSSESSIVE_S, '')
}

/**
 * Significant tokens for loose matching (stop words dropped).
 * "Tale of a Scribe Who Retires" → ["tale", "scribe", "retires"].
 */
export function searchTokens(value: string): string[] {
  const lowered = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const tokens: string[] = []
  for (const raw of lowered.split(TOKEN_SPLIT)) {
    if (!raw) continue
    const key = raw.replace(KEEP_CHARS, '')
    if (!key || STOP_WORDS.has(key)) continue
    tokens.push(key)
  }
  return tokens
}

/** Stopword-stripped compact key — "Tale of the X" ≡ "Tale of a X". */
export function looseSearchKey(value: string): string {
  return searchTokens(value).join('')
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
  if (!nameKey || !queryKey) return Infinity
  if (nameKey === queryKey) return 0
  if (nameKey.startsWith(queryKey)) return 1
  if (allowSubstring && nameKey.includes(queryKey)) return 2
  return Infinity
}

/**
 * Unordered token hit: every query token prefixes / equals / sits inside a
 * distinct name token. Ranked below contiguous compact matches.
 */
function scoreUnorderedTokens(name: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return Infinity
  // Single short token is already covered by compact prefix / substring.
  if (queryTokens.length === 1 && queryTokens[0]!.length < 3) return Infinity

  const nameTokens = searchTokens(name)
  if (nameTokens.length === 0) return Infinity

  const used = new Set<number>()
  for (const qt of queryTokens) {
    let found = false
    for (let i = 0; i < nameTokens.length; i++) {
      if (used.has(i)) continue
      const nt = nameTokens[i]!
      if (nt === qt || nt.startsWith(qt) || (qt.length >= 3 && nt.includes(qt))) {
        used.add(i)
        found = true
        break
      }
    }
    if (!found) return Infinity
  }
  return 3
}

/**
 * Rank how well `name` matches an already-normalized query key.
 * 0 exact, 1 prefix, 2 substring, 3 token-bag, Infinity no match.
 * Considers name-order variants (exact "kangseol" vs stored "Seol Kang") and
 * optional English possessives.
 *
 * Pass `looseQueryKey` / `queryTokens` for stopword-tolerant and bag-of-token hits.
 * Substring hits are opt-in so short autocomplete queries can stay prefix-only.
 */
export function scoreSearchKey(
  name: string,
  queryKey: string,
  options?: {
    allowSubstring?: boolean
    looseQueryKey?: string
    queryTokens?: string[]
  },
): number {
  if (!queryKey && !options?.looseQueryKey && !options?.queryTokens?.length) {
    return Infinity
  }

  const allowSubstring = options?.allowSubstring ?? true
  let best = Infinity

  for (const variant of nameOrderVariants(name)) {
    if (queryKey) {
      for (const n of normalizeSearchKeys(variant)) {
        best = Math.min(best, scoreCompactKey(n, queryKey, allowSubstring))
        if (best === 0) return 0
      }
    }

    const looseQuery = options?.looseQueryKey
    if (looseQuery && looseQuery !== queryKey) {
      const nameLoose = looseSearchKey(variant)
      best = Math.min(best, scoreCompactKey(nameLoose, looseQuery, allowSubstring))
      if (best === 0) return 0
    }
  }

  if (best < Infinity) return best

  const tokens = options?.queryTokens
  if (tokens && tokens.length > 0) {
    for (const variant of nameOrderVariants(name)) {
      best = Math.min(best, scoreUnorderedTokens(variant, tokens))
      if (best === 3) return 3
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

export interface HighlightSegment {
  text: string
  matched: boolean
}

/**
 * Split a dropdown label into matched / unmatched spans for the typed query.
 * Prefers whole-title compact prefix highlighting, then per-word token hits.
 */
export function highlightTitleMatches(
  label: string,
  query: string,
): HighlightSegment[] {
  const trimmed = label.trim() ? label : ''
  if (!trimmed) return []

  const queryKey = normalizeSearchKey(query)
  const looseKey = looseSearchKey(query)
  const tokens = searchTokens(query)

  if (!queryKey && tokens.length === 0) {
    return [{ text: trimmed, matched: false }]
  }

  const compactPrefix =
    (queryKey && normalizeSearchKey(trimmed).startsWith(queryKey) && queryKey) ||
    (looseKey &&
      looseKey !== queryKey &&
      looseSearchKey(trimmed).startsWith(looseKey) &&
      looseKey) ||
    ''

  if (compactPrefix) {
    const prefixSegs = highlightCompactPrefix(trimmed, compactPrefix)
    if (prefixSegs) return prefixSegs
  }

  if (tokens.length === 0) {
    return [{ text: trimmed, matched: false }]
  }

  // Keep separators so spacing / punctuation stay intact.
  const parts = trimmed.split(/(\s+|[:\-–,+/&|()]+)/)
  return parts.map((part) => {
    if (!part || /^[\s:\-–,+/&|()]+$/.test(part)) {
      return { text: part, matched: false }
    }
    const key = normalizeSearchKey(part)
    if (!key || STOP_WORDS.has(key)) {
      return { text: part, matched: false }
    }
    const matched = tokens.some(
      (qt) => key === qt || key.startsWith(qt) || (qt.length >= 3 && key.includes(qt)),
    )
    return { text: part, matched }
  })
}

/**
 * Map a compact-key prefix onto visible label characters (spaces ignored in
 * the key but preserved in output).
 */
function highlightCompactPrefix(
  label: string,
  queryKey: string,
): HighlightSegment[] | null {
  if (!queryKey) return null

  let matchedChars = 0
  let splitAt = -1
  for (let i = 0; i < label.length; i++) {
    const piece = normalizeSearchKey(label[i]!)
    if (!piece) continue
    for (const ch of piece) {
      if (matchedChars >= queryKey.length) break
      if (ch !== queryKey[matchedChars]) return null
      matchedChars += 1
    }
    if (matchedChars >= queryKey.length) {
      splitAt = i + 1
      break
    }
  }

  if (splitAt < 0 || matchedChars < queryKey.length) return null

  const head = label.slice(0, splitAt)
  const tail = label.slice(splitAt)
  const segs: HighlightSegment[] = [{ text: head, matched: true }]
  if (tail) segs.push({ text: tail, matched: false })
  return segs
}
