import type { FeedbackTone, GuessFeedback, ManhwaStatus } from './anilist-types'

export type GenreKnowledgeState = 'unknown' | 'exact' | 'partial' | 'wrong'

export interface KnownInfo {
  genres: {
    state: GenreKnowledgeState
    confirmed: string[]
    ruledOut: string[]
    summary: string
  }
  year: {
    exact: number | null
    minExclusive: number | null
    maxExclusive: number | null
    summary: string
  }
  status: {
    known: ManhwaStatus | null
    ruledOut: ManhwaStatus[]
    summary: string
  }
  publisher: {
    known: string | null
    ruledOut: string[]
    summary: string
  }
  tags: {
    confirmed: string[]
    ruledOut: string[]
  }
}

function keyOf(value: string): string {
  return value.trim().toLowerCase()
}

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = keyOf(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function genreSummary(state: GenreKnowledgeState, confirmed: string[], ruledOut: string[]): string {
  if (state === 'exact') {
    return confirmed.length > 0 ? `Exact match: ${confirmed.join(', ')}` : 'Genres fully matched'
  }
  if (state === 'partial') {
    return confirmed.length > 0
      ? `Partly right — confirmed: ${confirmed.join(', ')}`
      : 'Partly right, but no confirmed genre names yet'
  }
  if (state === 'wrong') {
    return ruledOut.length > 0
      ? `Completely wrong so far — not: ${ruledOut.join(', ')}`
      : 'Completely wrong so far'
  }
  return 'No genre clues yet'
}

function yearSummary(
  exact: number | null,
  minExclusive: number | null,
  maxExclusive: number | null,
): string {
  if (exact != null) return `Starts in ${exact}`

  const after = minExclusive != null ? `after ${minExclusive}` : null
  const before = maxExclusive != null ? `before ${maxExclusive}` : null

  if (after && before) return `After ${minExclusive}, before ${maxExclusive}`
  if (after) return `Later than ${minExclusive}`
  if (before) return `Earlier than ${maxExclusive}`
  return 'No year clues yet'
}

function statusSummary(known: ManhwaStatus | null, ruledOut: ManhwaStatus[]): string {
  if (known) return `Status is ${known}`
  if (ruledOut.length > 0) return `Not ${ruledOut.join(' or ')}`
  return 'No status clues yet'
}

function publisherSummary(known: string | null, ruledOut: string[]): string {
  if (known) return `Publisher is ${known}`
  if (ruledOut.length > 0) return `Not ${ruledOut.join(' or ')}`
  return 'No publisher clues yet'
}

/** Aggregate per-guess feedback into a running set of known facts */
export function buildKnownInfo(rows: GuessFeedback[]): KnownInfo {
  if (rows.length === 0) {
    return {
      genres: { state: 'unknown', confirmed: [], ruledOut: [], summary: genreSummary('unknown', [], []) },
      year: {
        exact: null,
        minExclusive: null,
        maxExclusive: null,
        summary: yearSummary(null, null, null),
      },
      status: { known: null, ruledOut: [], summary: statusSummary(null, []) },
      publisher: { known: null, ruledOut: [], summary: publisherSummary(null, []) },
      tags: { confirmed: [], ruledOut: [] },
    }
  }

  let genreState: GenreKnowledgeState = 'unknown'
  let bestGenreTone: FeedbackTone | null = null
  const confirmedGenres: string[] = []
  const seenGenreKeys = new Set<string>()
  const ruledOutGenreKeys = new Set<string>()
  const ruledOutGenres: string[] = []

  let exactYear: number | null = null
  let minExclusive: number | null = null
  let maxExclusive: number | null = null

  let knownStatus: ManhwaStatus | null = null
  const ruledOutStatuses: ManhwaStatus[] = []
  const ruledOutStatusKeys = new Set<string>()

  let knownPublisher: string | null = null
  const ruledOutPublishers: string[] = []
  const ruledOutPublisherKeys = new Set<string>()

  const confirmedTags: string[] = []
  const confirmedTagKeys = new Set<string>()
  const ruledOutTags: string[] = []
  const ruledOutTagKeys = new Set<string>()

  for (const row of rows) {
    const tone = row.genres.tone
    if (tone === 'correct') {
      genreState = 'exact'
      bestGenreTone = 'correct'
      for (const g of row.genres.shared.length ? row.genres.shared : row.genres.guessed) {
        const k = keyOf(g)
        if (!k || seenGenreKeys.has(k)) continue
        seenGenreKeys.add(k)
        confirmedGenres.push(g)
      }
    } else if (tone === 'close') {
      if (bestGenreTone !== 'correct') {
        genreState = 'partial'
        bestGenreTone = 'close'
      }
      for (const g of row.genres.shared) {
        const k = keyOf(g)
        if (!k || seenGenreKeys.has(k)) continue
        seenGenreKeys.add(k)
        confirmedGenres.push(g)
      }
      for (const g of row.genres.guessed) {
        const k = keyOf(g)
        if (!k || seenGenreKeys.has(k) || ruledOutGenreKeys.has(k)) continue
        if (row.genres.shared.some((s) => keyOf(s) === k)) continue
        ruledOutGenreKeys.add(k)
        ruledOutGenres.push(g)
      }
    } else {
      if (bestGenreTone == null) {
        genreState = 'wrong'
        bestGenreTone = 'incorrect'
      } else if (bestGenreTone === 'incorrect') {
        genreState = 'wrong'
      }
      for (const g of row.genres.guessed) {
        const k = keyOf(g)
        if (!k || seenGenreKeys.has(k) || ruledOutGenreKeys.has(k)) continue
        ruledOutGenreKeys.add(k)
        ruledOutGenres.push(g)
      }
    }

    const { year, direction } = row.year
    if (year != null) {
      if (direction === 'exact') {
        exactYear = year
      } else if (direction === 'up') {
        minExclusive = minExclusive == null ? year : Math.max(minExclusive, year)
      } else if (direction === 'down') {
        maxExclusive = maxExclusive == null ? year : Math.min(maxExclusive, year)
      }
    }

    if (row.status.tone === 'correct') {
      knownStatus = row.status.status
    } else {
      const k = keyOf(String(row.status.status))
      if (k && !ruledOutStatusKeys.has(k)) {
        ruledOutStatusKeys.add(k)
        ruledOutStatuses.push(row.status.status)
      }
    }

    if (row.publisher.tone === 'correct') {
      knownPublisher = row.publisher.publisher
    } else {
      const k = keyOf(row.publisher.publisher)
      if (k && !ruledOutPublisherKeys.has(k)) {
        ruledOutPublisherKeys.add(k)
        ruledOutPublishers.push(row.publisher.publisher)
      }
    }

    for (const tag of row.tags.shared) {
      const k = keyOf(tag)
      if (!k || confirmedTagKeys.has(k)) continue
      confirmedTagKeys.add(k)
      confirmedTags.push(tag)
      if (ruledOutTagKeys.has(k)) {
        ruledOutTagKeys.delete(k)
        const idx = ruledOutTags.findIndex((t) => keyOf(t) === k)
        if (idx >= 0) ruledOutTags.splice(idx, 1)
      }
    }

    for (const tag of row.tags.guessed) {
      const k = keyOf(tag)
      if (!k || confirmedTagKeys.has(k) || ruledOutTagKeys.has(k)) continue
      if (row.tags.shared.some((s) => keyOf(s) === k)) continue
      ruledOutTagKeys.add(k)
      ruledOutTags.push(tag)
    }
  }

  // If a genre was later confirmed, drop it from ruled out
  const cleanRuledOutGenres = ruledOutGenres.filter((g) => !seenGenreKeys.has(keyOf(g)))

  if (exactYear != null) {
    minExclusive = null
    maxExclusive = null
  }

  if (knownStatus) {
    ruledOutStatuses.length = 0
  }

  if (knownPublisher) {
    ruledOutPublishers.length = 0
  }

  return {
    genres: {
      state: genreState,
      confirmed: uniquePreserve(confirmedGenres),
      ruledOut: uniquePreserve(cleanRuledOutGenres),
      summary: genreSummary(genreState, confirmedGenres, cleanRuledOutGenres),
    },
    year: {
      exact: exactYear,
      minExclusive,
      maxExclusive,
      summary: yearSummary(exactYear, minExclusive, maxExclusive),
    },
    status: {
      known: knownStatus,
      ruledOut: uniquePreserve(ruledOutStatuses.map(String)),
      summary: statusSummary(knownStatus, ruledOutStatuses),
    },
    publisher: {
      known: knownPublisher,
      ruledOut: uniquePreserve(ruledOutPublishers),
      summary: publisherSummary(knownPublisher, ruledOutPublishers),
    },
    tags: {
      confirmed: uniquePreserve(confirmedTags),
      ruledOut: uniquePreserve(ruledOutTags),
    },
  }
}
