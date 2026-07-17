import protagonistsData from '../data/protagonists.json'
import type { Manhwa, ManhwaCharacter } from './anilist-types'
import { mainCharacters } from './anilist-types'

const protagonistByManhwaId = new Map(
  Object.entries(protagonistsData.protagonists).map(([manhwaId, characterId]) => [
    Number(manhwaId),
    Number(characterId),
  ]),
)

/**
 * The story's POV / lead character for bonus questions.
 * Prefers curated AniList RELEVANCE order (+ overrides) over "any MAIN".
 */
export function pickMainCharacter(manhwa: Manhwa): ManhwaCharacter | null {
  const mains = mainCharacters(manhwa)
  if (mains.length === 0) return null

  const preferredId = protagonistByManhwaId.get(manhwa.id)
  if (preferredId != null) {
    const match = mains.find((character) => character.id === preferredId)
    if (match) return match
  }

  return mains[0] ?? null
}
