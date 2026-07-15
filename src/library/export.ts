import type { Manhwa } from '../lib/anilist-types'
import type { StoryDescriptionBlurbFile } from '../lib/blurbs'
import type { CharacterCropFile } from '../lib/crops'
import type {
  DbBlurbRow,
  DbCropRow,
  DbExportDocument,
  LibraryRecord,
} from './types'
import { displayName } from './types'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function sortByRank(records: LibraryRecord[]): LibraryRecord[] {
  return [...records].sort((a, b) => {
    const rankA =
      a.blurb?.rank ?? a.crops[0]?.rank ?? Number.MAX_SAFE_INTEGER
    const rankB =
      b.blurb?.rank ?? b.crops[0]?.rank ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })
}

/** Rebuild game-ready JSON files from editor state. */
export function toGameFiles(
  records: LibraryRecord[],
  blurbMeta: StoryDescriptionBlurbFile['meta'],
  cropMeta: CharacterCropFile['meta'],
): {
  manhwa: Manhwa[]
  blurbs: StoryDescriptionBlurbFile
  crops: CharacterCropFile
} {
  const sorted = sortByRank(records)
  const manhwa = sorted.map((record) => record.manhwa)

  const blurbEntries = sorted
    .map((record) => {
      if (!record.blurb) return null
      const tiers = record.blurb.storyDescriptionBlurb
      if (!tiers.t0.trim() && !tiers.t1.trim()) return null
      return {
        ...record.blurb,
        manhwaId: record.manhwa.id,
        title: record.blurb.title?.trim() || displayName(record.manhwa),
        storyDescriptionBlurb: {
          t0: tiers.t0.trim(),
          t1: tiers.t1.trim(),
        },
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const cropEntries = sorted.flatMap((record) =>
    (record.crops || [])
      .filter((crop) => crop.imageUrl?.trim())
      .map((crop) => ({
        ...crop,
        manhwaId: record.manhwa.id,
        title: crop.title?.trim() || displayName(record.manhwa),
        imageUrl: crop.imageUrl.trim(),
        focusX: crop.focusX,
        focusY: crop.focusY,
        characterName: crop.characterName?.trim() || undefined,
        characterId: crop.characterId,
      })),
  )

  return {
    manhwa,
    blurbs: {
      meta: {
        ...blurbMeta,
        count: blurbEntries.length,
        generatedAt: new Date().toISOString(),
      },
      entries: blurbEntries,
    },
    crops: {
      meta: {
        ...cropMeta,
        count: cropEntries.length,
        generatedAt: new Date().toISOString(),
      },
      entries: cropEntries,
    },
  }
}

/** Flatten into relational-friendly rows for DB import. */
export function toDbExport(
  records: LibraryRecord[],
  blurbType = 'storyDescriptionBlurb',
): DbExportDocument {
  const { manhwa } = toGameFiles(records, undefined, undefined)
  const blurbs: DbBlurbRow[] = []
  const character_crops: DbCropRow[] = []

  for (const record of records) {
    const entry = record.blurb
    if (entry) {
      const tiers = entry.storyDescriptionBlurb
      for (const tier of ['t0', 't1'] as const) {
        const text = tiers[tier]?.trim()
        if (!text) continue
        blurbs.push({
          manhwa_id: record.manhwa.id,
          blurb_type: blurbType,
          tier,
          text,
          rank: entry.rank ?? null,
          title: entry.title?.trim() || displayName(record.manhwa),
        })
      }
    }

    for (const crop of record.crops || []) {
      if (!crop.imageUrl?.trim()) continue
      character_crops.push({
        manhwa_id: record.manhwa.id,
        image_url: crop.imageUrl.trim(),
        focus_x: crop.focusX,
        focus_y: crop.focusY,
        character_name: crop.characterName?.trim() || null,
        character_id: crop.characterId ?? null,
        rank: crop.rank ?? null,
        title: crop.title?.trim() || displayName(record.manhwa),
      })
    }
  }

  blurbs.sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    if (a.manhwa_id !== b.manhwa_id) return a.manhwa_id - b.manhwa_id
    return a.tier.localeCompare(b.tier)
  })

  character_crops.sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    if (a.manhwa_id !== b.manhwa_id) return a.manhwa_id - b.manhwa_id
    return (a.character_id ?? 0) - (b.character_id ?? 0)
  })

  return {
    exportedAt: new Date().toISOString(),
    format: 'manhwadle-relational-v1',
    manhwa,
    blurbs,
    character_crops,
  }
}

export function downloadGameFiles(
  records: LibraryRecord[],
  blurbMeta: StoryDescriptionBlurbFile['meta'],
  cropMeta: CharacterCropFile['meta'],
) {
  const files = toGameFiles(records, blurbMeta, cropMeta)
  downloadJson('manhwa.json', files.manhwa)
  downloadJson('storyDescriptionBlurb.json', files.blurbs)
  downloadJson('characterCrop.json', files.crops)
}

export function downloadDbExport(records: LibraryRecord[]) {
  downloadJson('manhwadle-db-export.json', toDbExport(records))
}
