import type { AvatarRarity } from './avatarComposition'

export const NEW_AVATAR_SHORTLIST_KEY = 'manhwadle:new-avatar-shortlist'

/** Shop-facing rarities you can assign while curating new plates. */
export type ShortlistShopRarity = Exclude<AvatarRarity, 'starter'>

export interface NewAvatarShortlistEntry {
  keep: boolean
  rarity: ShortlistShopRarity
}

export type NewAvatarShortlist = Record<string, NewAvatarShortlistEntry>

const SHOP_RARITIES: readonly ShortlistShopRarity[] = ['common', 'rare', 'epic', 'legendary']

/** Style A shop point costs by rarity band (matches live rare/epic catalog pricing). */
export const SHORTLIST_SHOP_PRICES: Record<ShortlistShopRarity, number> = {
  common: 2000,
  rare: 4000,
  epic: 7000,
  legendary: 10000,
}

export function isShortlistShopRarity(value: string): value is ShortlistShopRarity {
  return (SHOP_RARITIES as readonly string[]).includes(value)
}

export function shortlistShopRarities(): readonly ShortlistShopRarity[] {
  return SHOP_RARITIES
}

export function shortlistShopPrice(rarity: ShortlistShopRarity): number {
  return SHORTLIST_SHOP_PRICES[rarity]
}

export function toShortlistShopRarity(rarity: AvatarRarity): ShortlistShopRarity {
  if (rarity === 'legendary') return 'legendary'
  if (rarity === 'epic') return 'epic'
  if (rarity === 'rare') return 'rare'
  return 'common'
}

export function emptyNewAvatarShortlist(): NewAvatarShortlist {
  return {}
}

function parseEntry(raw: unknown): NewAvatarShortlistEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.keep !== 'boolean') return null
  if (typeof row.rarity !== 'string' || !isShortlistShopRarity(row.rarity)) return null
  return { keep: row.keep, rarity: row.rarity }
}

export function parseNewAvatarShortlist(raw: unknown): NewAvatarShortlist {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyNewAvatarShortlist()
  const next: NewAvatarShortlist = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id.startsWith('avatar_')) continue
    const entry = parseEntry(value)
    if (entry) next[id] = entry
  }
  return next
}

export function readNewAvatarShortlist(): NewAvatarShortlist {
  try {
    const raw = localStorage.getItem(NEW_AVATAR_SHORTLIST_KEY)
    if (!raw) return emptyNewAvatarShortlist()
    return parseNewAvatarShortlist(JSON.parse(raw) as unknown)
  } catch {
    return emptyNewAvatarShortlist()
  }
}

export function writeNewAvatarShortlist(shortlist: NewAvatarShortlist): void {
  try {
    localStorage.setItem(NEW_AVATAR_SHORTLIST_KEY, JSON.stringify(shortlist))
  } catch {
    // Ignore quota / private-mode failures in the temp curator UI.
  }
}

export function resolveShortlistEntry(
  shortlist: NewAvatarShortlist,
  characterId: string,
  catalogRarity: AvatarRarity,
): NewAvatarShortlistEntry {
  return (
    shortlist[characterId] ?? {
      keep: false,
      rarity: toShortlistShopRarity(catalogRarity),
    }
  )
}

export function setShortlistKeep(
  shortlist: NewAvatarShortlist,
  characterId: string,
  catalogRarity: AvatarRarity,
  keep: boolean,
): NewAvatarShortlist {
  const current = resolveShortlistEntry(shortlist, characterId, catalogRarity)
  return { ...shortlist, [characterId]: { ...current, keep } }
}

export function setShortlistRarity(
  shortlist: NewAvatarShortlist,
  characterId: string,
  catalogRarity: AvatarRarity,
  rarity: ShortlistShopRarity,
): NewAvatarShortlist {
  const current = resolveShortlistEntry(shortlist, characterId, catalogRarity)
  return { ...shortlist, [characterId]: { ...current, rarity } }
}

export function keptShortlistExport(
  shortlist: NewAvatarShortlist,
  characters: readonly { id: string; name: string; rarity: AvatarRarity }[],
): { id: string; name: string; rarity: ShortlistShopRarity; price: number }[] {
  return characters
    .map((character) => {
      const entry = resolveShortlistEntry(shortlist, character.id, character.rarity)
      if (!entry.keep) return null
      return {
        id: character.id,
        name: character.name,
        rarity: entry.rarity,
        price: shortlistShopPrice(entry.rarity),
      }
    })
    .filter(
      (row): row is { id: string; name: string; rarity: ShortlistShopRarity; price: number } =>
        row != null,
    )
}
