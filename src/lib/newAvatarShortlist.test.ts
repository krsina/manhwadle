import { describe, expect, it } from 'vitest'
import {
  keptShortlistExport,
  parseNewAvatarShortlist,
  resolveShortlistEntry,
  setShortlistKeep,
  setShortlistRarity,
  shortlistShopPrice,
  toShortlistShopRarity,
} from './newAvatarShortlist'

describe('newAvatarShortlist', () => {
  it('maps catalog rarities into shop bands', () => {
    expect(toShortlistShopRarity('starter')).toBe('common')
    expect(toShortlistShopRarity('common')).toBe('common')
    expect(toShortlistShopRarity('rare')).toBe('rare')
    expect(toShortlistShopRarity('epic')).toBe('epic')
    expect(toShortlistShopRarity('legendary')).toBe('legendary')
  })

  it('prices follow the Style A shop ladder', () => {
    expect(shortlistShopPrice('common')).toBe(2000)
    expect(shortlistShopPrice('rare')).toBe(4000)
    expect(shortlistShopPrice('epic')).toBe(7000)
    expect(shortlistShopPrice('legendary')).toBe(10000)
  })

  it('ignores malformed rows and keeps valid keep/rarity picks', () => {
    const parsed = parseNewAvatarShortlist({
      avatar_ok: { keep: true, rarity: 'epic' },
      avatar_bad_rarity: { keep: true, rarity: 'starter' },
      avatar_bad_keep: { keep: 'yes', rarity: 'rare' },
      not_an_avatar: { keep: true, rarity: 'rare' },
    })
    expect(parsed).toEqual({ avatar_ok: { keep: true, rarity: 'epic' } })
  })

  it('defaults to not kept with catalog rarity, then updates keep and rarity', () => {
    let shortlist = parseNewAvatarShortlist({})
    expect(resolveShortlistEntry(shortlist, 'avatar_a', 'rare')).toEqual({
      keep: false,
      rarity: 'rare',
    })

    shortlist = setShortlistKeep(shortlist, 'avatar_a', 'rare', true)
    shortlist = setShortlistRarity(shortlist, 'avatar_a', 'rare', 'epic')
    expect(shortlist.avatar_a).toEqual({ keep: true, rarity: 'epic' })
  })

  it('exports only kept characters with chosen rarity and matching price', () => {
    const shortlist = setShortlistRarity(
      setShortlistKeep({}, 'avatar_keep', 'common', true),
      'avatar_keep',
      'common',
      'legendary',
    )
    const exported = keptShortlistExport(shortlist, [
      { id: 'avatar_keep', name: 'Keep Me', rarity: 'common' },
      { id: 'avatar_drop', name: 'Drop Me', rarity: 'rare' },
    ])
    expect(exported).toEqual([
      { id: 'avatar_keep', name: 'Keep Me', rarity: 'legendary', price: 10000 },
    ])
  })
})
