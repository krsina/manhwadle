import {
  AVATAR_CHARACTER_META,
  DEFAULT_AVATAR_ID,
  compareShopItemsByPrice,
  getAvatarCharacterMeta,
  normalizeEquippedAvatarId,
  starterAvatarIds,
  type AvatarRarity,
} from './avatarComposition'
import {
  AVATAR_STAGE_META,
  DEFAULT_STAGE_ID,
  getAvatarStageMeta,
  normalizeEquippedStageId,
  starterStageIds,
} from './avatarStages'
import { supabase } from './supabase'

export interface AvatarShopItem {
  id: string
  name: string
  description: string
  price: number
  rarity: AvatarRarity
  assetKey: string
  owned: boolean
  equipped?: boolean
  /** Free limited-time claim — show Limited-time badge; not a permanent starter. */
  limitedTime?: boolean
}

export interface AvatarShopSnapshot {
  authenticated: boolean
  balance: number
  equippedAvatarId: string
  equippedStageId: string
  items: AvatarShopItem[]
  stages: AvatarShopItem[]
}

/** Offline guest catalog: Style A whole-character defaults + shop characters. */
export const AVATAR_CATALOG_FALLBACK: readonly AvatarShopItem[] = AVATAR_CHARACTER_META.map((meta) => ({
  id: meta.id,
  name: meta.name,
  description: meta.description,
  price: meta.price,
  rarity: meta.rarity,
  assetKey: meta.assetKey,
  owned: meta.starter,
  equipped: meta.id === DEFAULT_AVATAR_ID,
  limitedTime: meta.limitedTime === true,
}))
  .slice()
  .sort(compareShopItemsByPrice)

export const STAGE_CATALOG_FALLBACK: readonly AvatarShopItem[] = AVATAR_STAGE_META.map((meta) => ({
  id: meta.id,
  name: meta.name,
  description: meta.description,
  price: meta.price,
  rarity: meta.rarity,
  assetKey: meta.assetKey,
  owned: meta.starter,
  equipped: meta.id === DEFAULT_STAGE_ID,
  limitedTime: meta.limitedTime === true,
}))
  .slice()
  .sort(compareShopItemsByPrice)

function fallbackShop(): AvatarShopSnapshot {
  const starters = new Set(starterAvatarIds())
  const stageStarters = new Set(starterStageIds())
  return {
    authenticated: false,
    balance: 0,
    equippedAvatarId: DEFAULT_AVATAR_ID,
    equippedStageId: DEFAULT_STAGE_ID,
    items: AVATAR_CATALOG_FALLBACK.map((item) => ({
      ...item,
      owned: starters.has(item.id),
      equipped: item.id === DEFAULT_AVATAR_ID,
    })).sort(compareShopItemsByPrice),
    stages: STAGE_CATALOG_FALLBACK.map((item) => ({
      ...item,
      owned: stageStarters.has(item.id),
      equipped: item.id === DEFAULT_STAGE_ID,
    })).sort(compareShopItemsByPrice),
  }
}

export type AvatarShopMutationResult =
  | {
      ok: true
      itemId?: string
      balance?: number
      equippedAvatarId?: string
      equippedStageId?: string
    }
  | { ok: false; error: string }

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

function isAvatarRarity(value: unknown): value is AvatarRarity {
  return (
    value === 'starter' ||
    value === 'common' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary'
  )
}

function parseShopItem(
  raw: unknown,
  equippedId: string,
  kind: 'avatar' | 'stage',
): AvatarShopItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = asString(item.id)
  const meta =
    kind === 'avatar'
      ? id
        ? getAvatarCharacterMeta(id)
        : null
      : id
        ? getAvatarStageMeta(id)
        : null
  const name = asString(item.name) ?? meta?.name
  if (!id || !name || !isAvatarRarity(item.rarity)) return null
  if (kind === 'stage' && !getAvatarStageMeta(id)) return null
  if (kind === 'avatar' && !getAvatarCharacterMeta(id)) return null
  const parsed: AvatarShopItem = {
    id,
    name,
    description: asString(item.description) ?? meta?.description ?? '',
    price: asNonNegativeInteger(item.price),
    rarity: item.rarity,
    assetKey: asString(item.asset_key) ?? meta?.assetKey ?? id,
    owned: item.owned === true || meta?.starter === true,
    equipped: item.equipped === true || id === equippedId,
    limitedTime:
      item.limited_time === true ||
      item.limitedTime === true ||
      (meta != null && 'limitedTime' in meta && meta.limitedTime === true),
  }
  return parsed
}

function mergeCatalog(
  parsed: AvatarShopItem[],
  fallback: readonly AvatarShopItem[],
  equippedId: string,
): AvatarShopItem[] {
  const seen = new Set(parsed.map((item) => item.id))
  const items = [...parsed]
  for (const row of fallback) {
    if (seen.has(row.id)) continue
    items.push({ ...row, equipped: row.id === equippedId })
    seen.add(row.id)
  }
  return items.sort(compareShopItemsByPrice)
}

export function parseAvatarShopSnapshot(raw: unknown): AvatarShopSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok !== true || !Array.isArray(row.items)) return null

  const equippedAvatarId = normalizeEquippedAvatarId(row.equipped_avatar_id)
  const equippedStageId = normalizeEquippedStageId(row.equipped_stage_id)

  const items: AvatarShopItem[] = []
  for (const rawItem of row.items) {
    const parsed = parseShopItem(rawItem, equippedAvatarId, 'avatar')
    if (parsed) items.push(parsed)
  }

  const stages: AvatarShopItem[] = []
  if (Array.isArray(row.stages)) {
    for (const rawItem of row.stages) {
      const parsed = parseShopItem(rawItem, equippedStageId, 'stage')
      if (parsed) stages.push(parsed)
    }
  }

  const authenticated = row.authenticated === true
  // Signed-in responses must not inject client-only catalog rows — those cannot be
  // claimed/purchased until the matching shop_items migration is live.
  const catalogItems = authenticated
    ? items.slice().sort(compareShopItemsByPrice)
    : mergeCatalog(items, AVATAR_CATALOG_FALLBACK, equippedAvatarId)
  const catalogStages = authenticated
    ? stages.slice().sort(compareShopItemsByPrice)
    : mergeCatalog(stages, STAGE_CATALOG_FALLBACK, equippedStageId)

  return {
    authenticated,
    balance: asNonNegativeInteger(row.balance),
    equippedAvatarId,
    equippedStageId,
    items: catalogItems,
    stages: catalogStages,
  }
}

function shopErrorMessage(code: string): string {
  switch (code) {
    case 'not_authenticated':
      return 'Sign in to use the avatar shop.'
    case 'cloud_banned':
      return 'Shop changes are disabled for this account.'
    case 'item_unavailable':
    case 'not_found':
      return 'That item is no longer available.'
    case 'already_owned':
      return 'You already own that item.'
    case 'gacha_only':
      return 'Characters are unlocked on the banner, not bought from the catalog.'
    case 'insufficient_points':
      return 'You do not have enough points yet.'
    case 'not_owned':
      return 'Purchase this item before equipping it.'
    case 'purchase_conflict':
      return 'This purchase could not be reconciled. Your points were not changed.'
    case 'profile_unavailable':
      return 'Your avatar profile could not be updated.'
    default:
      return 'The shop could not complete that request.'
  }
}

export async function fetchAvatarShop(): Promise<
  { ok: true; shop: AvatarShopSnapshot } | { ok: false; error: string }
> {
  if (!supabase) {
    return { ok: true, shop: fallbackShop() }
  }
  const { data, error } = await supabase.rpc('get_avatar_shop')
  if (error) {
    console.warn('[shop] get_avatar_shop failed:', error.message)
    return { ok: true, shop: fallbackShop() }
  }
  const shop = parseAvatarShopSnapshot(data)
  return shop ? { ok: true, shop } : { ok: false, error: 'Unexpected shop response.' }
}

export async function purchaseShopItem(itemId: string): Promise<AvatarShopMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('purchase_shop_item', { p_item_id: itemId })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: shopErrorMessage('unexpected') }
  }
  const row = data as Record<string, unknown>
  if (row.ok !== true) {
    return { ok: false, error: shopErrorMessage(asString(row.error) ?? 'unexpected') }
  }
  const resolvedId = asString(row.item_id) ?? itemId
  return {
    ok: true,
    itemId: resolvedId,
    balance:
      typeof row.balance === 'number' ? asNonNegativeInteger(row.balance) : undefined,
  }
}

/** Alias for purchaseShopItem — kept for callers expecting the avatar-specific name. */
export const purchaseAvatar = purchaseShopItem

export async function equipAvatar(avatarId: string): Promise<AvatarShopMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('equip_avatar', { p_item_id: avatarId })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: shopErrorMessage('unexpected') }
  }
  const row = data as Record<string, unknown>
  if (row.ok !== true) {
    return { ok: false, error: shopErrorMessage(asString(row.error) ?? 'unexpected') }
  }
  return {
    ok: true,
    equippedAvatarId: normalizeEquippedAvatarId(row.equipped_avatar_id ?? avatarId),
  }
}

export async function equipStage(stageId: string): Promise<AvatarShopMutationResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await supabase.rpc('equip_stage', { p_item_id: stageId })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: shopErrorMessage('unexpected') }
  }
  const row = data as Record<string, unknown>
  if (row.ok !== true) {
    return { ok: false, error: shopErrorMessage(asString(row.error) ?? 'unexpected') }
  }
  return {
    ok: true,
    equippedStageId: normalizeEquippedStageId(row.equipped_stage_id ?? stageId),
  }
}
