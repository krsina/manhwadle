import { getAvatarCharacterMeta } from './avatarComposition'
import {
  emptyGachaPity,
  isGachaRarity,
  starterOwnedIds,
  toGachaRarity,
  type GachaPityState,
  type GachaRarity,
  type GachaRollResult,
} from './gacha'
import { weeklyFeaturedCharacters, weeklyFeaturedPrice } from './gachaWeekly'
import { supabase } from './supabase'

export interface GachaFeaturedRow {
  id: string
  rarity: GachaRarity
  price: number
}

export interface GachaStateSnapshot {
  authenticated: boolean
  balance: number
  equippedAvatarId: string | null
  pity: GachaPityState
  owned: Record<string, number>
  lastResult: { characterId: string; rarity: GachaRarity; isNew: boolean } | null
  featured: GachaFeaturedRow[]
}

export type GachaMutationResult =
  | { ok: true; state: GachaStateSnapshot; rolled: GachaRollResult }
  | { ok: false; error: string }

function asFiniteInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function parseOwned(raw: unknown): Record<string, number> {
  const owned: Record<string, number> = {}
  for (const id of starterOwnedIds()) owned[id] = 1
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return owned
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!getAvatarCharacterMeta(id)) continue
    const copies = asFiniteInt(count, 0)
    if (copies > 0) owned[id] = copies
  }
  return owned
}

function parsePity(raw: unknown): GachaPityState {
  if (!raw || typeof raw !== 'object') return emptyGachaPity()
  const row = raw as Record<string, unknown>
  return {
    pullCount: asFiniteInt(row.pullCount ?? row.pull_count, 0),
    pullsSinceRarePlus: asFiniteInt(row.pullsSinceRarePlus ?? row.pulls_since_rare_plus, 0),
  }
}

function parseFeatured(raw: unknown): GachaFeaturedRow[] {
  if (!Array.isArray(raw)) return []
  const rows: GachaFeaturedRow[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : null
    const rarity = typeof row.rarity === 'string' && isGachaRarity(row.rarity) ? row.rarity : null
    if (!id || !getAvatarCharacterMeta(id) || !rarity) continue
    rows.push({
      id,
      rarity,
      price: asFiniteInt(row.price, weeklyFeaturedPrice(getAvatarCharacterMeta(id)!)),
    })
  }
  return rows
}

function parseLastResult(
  raw: unknown,
): { characterId: string; rarity: GachaRarity; isNew: boolean } | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const characterId =
    typeof row.characterId === 'string'
      ? row.characterId
      : typeof row.character_id === 'string'
        ? row.character_id
        : null
  if (!characterId || !getAvatarCharacterMeta(characterId)) return null
  const rarityRaw = row.rarity
  if (typeof rarityRaw !== 'string' || !isGachaRarity(rarityRaw)) return null
  return {
    characterId,
    rarity: rarityRaw,
    isNew: row.isNew === true || row.is_new === true,
  }
}

export function parseGachaStateSnapshot(raw: unknown): GachaStateSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok === false) return null
  return {
    authenticated: row.authenticated === true,
    balance: asFiniteInt(row.balance, 0),
    equippedAvatarId:
      typeof row.equipped_avatar_id === 'string' && getAvatarCharacterMeta(row.equipped_avatar_id)
        ? row.equipped_avatar_id
        : typeof row.equippedAvatarId === 'string' && getAvatarCharacterMeta(row.equippedAvatarId)
          ? row.equippedAvatarId
          : null,
    pity: parsePity(row.pity),
    owned: parseOwned(row.owned),
    lastResult: parseLastResult(row.last_result ?? row.lastResult),
    featured: parseFeatured(row.featured),
  }
}

export function gachaErrorMessage(code: string): string {
  switch (code) {
    case 'not_authenticated':
      return 'Sign in to pull on the character banner.'
    case 'cloud_banned':
      return 'Shop changes are disabled for this account.'
    case 'insufficient_points':
      return 'You do not have enough points yet.'
    case 'rate_limited':
      return 'The banner is busy. Wait a moment and try again.'
    case 'not_featured':
      return 'That skin is not featured this week.'
    case 'not_enough_copies':
      return 'You need 5 copies to exchange.'
    case 'starter_locked':
      return 'Starter looks cannot be exchanged.'
    case 'empty_pool':
      return 'The banner has no plates for that rarity yet.'
    case 'gacha_only':
      return 'Characters are unlocked on the banner, not bought from the catalog.'
    case 'not_found':
      return 'That item is no longer available.'
    case 'purchase_conflict':
      return 'This purchase could not be reconciled. Your points were not changed.'
    default:
      return 'The banner could not complete that request.'
  }
}

function mutationFromPayload(raw: unknown): GachaMutationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: gachaErrorMessage('unexpected') }
  }
  const row = raw as Record<string, unknown>
  if (row.ok !== true) {
    return { ok: false, error: gachaErrorMessage(String(row.error ?? 'unexpected')) }
  }
  const state = parseGachaStateSnapshot(row)
  const last = parseLastResult({
    character_id: row.character_id,
    rarity: row.rarity,
    is_new: row.is_new,
  }) ?? state?.lastResult
  const character = last ? getAvatarCharacterMeta(last.characterId) : null
  if (!state || !last || !character) {
    return { ok: false, error: gachaErrorMessage('unexpected') }
  }
  return {
    ok: true,
    state,
    rolled: {
      character,
      rarity: last.rarity,
      isNew: last.isNew,
      pity: state.pity,
    },
  }
}

export function clientWeeklyFeatured(now = new Date()): GachaFeaturedRow[] {
  return weeklyFeaturedCharacters(now).map((character) => ({
    id: character.id,
    rarity: toGachaRarity(character.rarity),
    price: weeklyFeaturedPrice(character),
  }))
}

export function guestGachaState(featured: GachaFeaturedRow[] = clientWeeklyFeatured()): GachaStateSnapshot {
  const owned: Record<string, number> = {}
  for (const id of starterOwnedIds()) owned[id] = 1
  return {
    authenticated: false,
    balance: 0,
    equippedAvatarId: null,
    pity: emptyGachaPity(),
    owned,
    lastResult: null,
    featured,
  }
}

export async function fetchGachaState(): Promise<
  { ok: true; state: GachaStateSnapshot } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('get_gacha_state')
  if (error) return { ok: false, error: error.message }
  const state = parseGachaStateSnapshot(data)
  return state ? { ok: true, state } : { ok: false, error: gachaErrorMessage('unexpected') }
}

export async function pullGacha(): Promise<GachaMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('pull_gacha')
  if (error) return { ok: false, error: error.message }
  return mutationFromPayload(data)
}

export async function buyGachaWeekly(itemId: string): Promise<GachaMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('buy_gacha_weekly', { p_item_id: itemId })
  if (error) return { ok: false, error: error.message }
  return mutationFromPayload(data)
}

export async function exchangeGachaCopies(sourceId: string): Promise<GachaMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('exchange_gacha_copies', { p_source_id: sourceId })
  if (error) return { ok: false, error: error.message }
  return mutationFromPayload(data)
}
