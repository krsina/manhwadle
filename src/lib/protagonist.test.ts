import { describe, expect, it } from 'vitest'
import manhwaData from '../data/manhwa.json'
import type { Manhwa } from './anilist-types'
import { pickMainCharacter } from './protagonist'

const catalog = manhwaData as Manhwa[]

function findTitle(english: string): Manhwa {
  const hit = catalog.find((m) => m.title.english === english)
  if (!hit) throw new Error(`Missing title: ${english}`)
  return hit
}

describe('pickMainCharacter', () => {
  it('picks the POV lead when AniList lists multiple MAIN cast', () => {
    expect(pickMainCharacter(findTitle('Tower of God'))?.name.full).toBe(
      'Twenty-Fifth Baam',
    )
    expect(pickMainCharacter(findTitle('True Beauty'))?.name.full).toBe(
      'Ju-Gyeong Lim',
    )
    expect(pickMainCharacter(findTitle('The Remarried Empress'))?.name.full).toBe(
      'Navier Trobi',
    )
    expect(pickMainCharacter(findTitle('Weak Hero'))?.name.full).toBe(
      'Si-Eun Yeon',
    )
    expect(pickMainCharacter(findTitle('Viral Hit'))?.name.full).toBe('Ho-Bin Yu')
    expect(pickMainCharacter(findTitle('Eleceed'))?.name.full).toBe('Ji-U Seo')
  })

  it('returns null when a title has no MAIN cast', () => {
    const bare = {
      ...findTitle('Solo Leveling'),
      characters: [],
    }
    expect(pickMainCharacter(bare)).toBeNull()
  })
})
