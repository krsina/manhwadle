/**
 * Progressive summary reveal using authored storyDescriptionBlurb tiers,
 * then the spoiler-scrubbed publisher description as the final unlock.
 *
 * Ladder (style guide):
 *   Start → t0
 *   After wrong guess(es) → t1
 *   Late / finished → full description
 */

export interface StoryDescriptionBlurbTiers {
  t0: string
  t1: string
}

export interface StoryDescriptionBlurbEntry {
  manhwaId: number
  rank?: number
  title?: string
  storyDescriptionBlurb: StoryDescriptionBlurbTiers
}

export interface StoryDescriptionBlurbFile {
  meta?: {
    version?: number
    blurbType?: string
    tiers?: string[]
    source?: string
    styleGuide?: string
    count?: number
    generatedAt?: string
    notes?: string[]
  }
  entries: StoryDescriptionBlurbEntry[]
}

/** Build id → ordered clue texts (t0, t1, …) from the ETL blurb file. */
export function indexStoryBlurbs(
  doc: StoryDescriptionBlurbFile,
): Map<number, string[]> {
  const map = new Map<number, string[]>()
  const tierKeys = doc.meta?.tiers?.length
    ? doc.meta.tiers
    : ['t0', 't1']

  for (const entry of doc.entries || []) {
    const blob = entry.storyDescriptionBlurb
    if (!blob || entry.manhwaId == null) continue
    const record = blob as unknown as Record<string, string | undefined>
    const tiers = tierKeys
      .map((key) => record[key]?.trim())
      .filter((text): text is string => Boolean(text))
    if (tiers.length > 0) map.set(entry.manhwaId, tiers)
  }

  return map
}

/**
 * Full unlock ladder for a title: authored tiers + scrubbed publisher description.
 */
export function buildRevealLadder(
  authoredTiers: string[] | undefined,
  fullDescription: string,
): string[] {
  const full = fullDescription.trim()
  const tiers = (authoredTiers || []).map((t) => t.trim()).filter(Boolean)
  if (tiers.length === 0) {
    return full ? [full] : ['No summary available for today’s manhwa.']
  }
  if (!full) return tiers
  // Avoid duplicating if an authored tier somehow equals the full text
  if (tiers.some((t) => t === full)) return tiers
  return [...tiers, full]
}

/** How many ladder steps are unlocked (starts at 1; finished reveals all). */
export function revealedBlurbCount(
  failedGuesses: number,
  totalBlurbs: number,
  { finished = false }: { finished?: boolean } = {},
): number {
  if (totalBlurbs <= 0) return 0
  if (finished) return totalBlurbs
  return Math.min(totalBlurbs, Math.max(1, failedGuesses + 1))
}
