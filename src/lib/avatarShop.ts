import {
  AWAKENING_CATALOG_FALLBACK,
  AVATAR_AWAKENINGS_ENABLED,
  normalizeAwakeningLevel,
  type AwakeningLevel,
  type AvatarAwakeningMeta,
} from './avatarAwakening'
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
  /** Owned awakening tier for this avatar (0 = none). Stages omit this. */
  awakeningLevel?: AwakeningLevel
}

export interface AvatarAwakeningShopItem extends AvatarAwakeningMeta {
  owned: boolean
}

export interface AvatarShopSnapshot {
  authenticated: boolean
  balance: number
  equippedAvatarId: string
  equippedStageId: string
  equippedAwakeningLevel: AwakeningLevel
  items: AvatarShopItem[]
  stages: AvatarShopItem[]
  awakenings: AvatarAwakeningShopItem[]
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
  awakeningLevel: 0 as AwakeningLevel,
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

export const AWAKENING_SHOP_FALLBACK: readonly AvatarAwakeningShopItem[] =
  AWAKENING_CATALOG_FALLBACK.map((row) => ({ ...row, owned: false }))

function fallbackShop(): AvatarShopSnapshot {
  const starters = new Set(starterAvatarIds())
  const stageStarters = new Set(starterStageIds())
  return {
    authenticated: false,
    balance: 0,
    equippedAvatarId: DEFAULT_AVATAR_ID,
    equippedStageId: DEFAULT_STAGE_ID,
    equippedAwakeningLevel: 0,
    items: AVATAR_CATALOG_FALLBACK.map((item) => ({
      ...item,
      owned: starters.has(item.id),
      equipped: item.id === DEFAULT_AVATAR_ID,
      awakeningLevel: 0 as AwakeningLevel,
    })).sort(compareShopItemsByPrice),
    stages: STAGE_CATALOG_FALLBACK.map((item) => ({
      ...item,
      owned: stageStarters.has(item.id),
      equipped: item.id === DEFAULT_STAGE_ID,
    })).sort(compareShopItemsByPrice),
    awakenings: AVATAR_AWAKENINGS_ENABLED
      ? AWAKENING_SHOP_FALLBACK.map((row) => ({ ...row }))
      : [],
  }
}

export type AvatarShopMutationResult =
  | {
      ok: true
      itemId?: string
      balance?: number
      equippedAvatarId?: string
      equippedStageId?: string
      awakeningLevel?: AwakeningLevel
      parentItemId?: string
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
  if (kind === 'avatar') {
    parsed.awakeningLevel = normalizeAwakeningLevel(item.awakening_level)
  }
  return parsed
}

function parseAwakeningShopItem(raw: unknown): AvatarAwakeningShopItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = asString(item.id)
  const parentItemId = asString(item.parent_item_id)
  const tierRaw = item.awakening_tier
  // Single Awakening only — ignore legacy tier-2 rows if they still arrive.
  if (tierRaw !== 1 && tierRaw !== '1') return null
  if (!id || !parentItemId || !getAvatarCharacterMeta(parentItemId)) return null
  if (!isAvatarRarity(item.rarity) || (item.rarity !== 'rare' && item.rarity !== 'epic')) return null
  const fallback = AWAKENING_CATALOG_FALLBACK.find((row) => row.id === id)
  return {
    id,
    parentItemId,
    awakeningTier: 1,
    name: asString(item.name) ?? fallback?.name ?? 'Awakening',
    description: asString(item.description) ?? fallback?.description ?? '',
    price: asNonNegativeInteger(item.price),
    rarity: item.rarity,
    assetKey: asString(item.asset_key) ?? fallback?.assetKey ?? id,
    owned: item.owned === true,
  }
}

function mergeAwakeningCatalog(
  parsed: AvatarAwakeningShopItem[],
): AvatarAwakeningShopItem[] {
  const seen = new Set(parsed.map((item) => item.id))
  const items = [...parsed]
  for (const row of AWAKENING_SHOP_FALLBACK) {
    if (seen.has(row.id)) continue
    items.push({ ...row })
    seen.add(row.id)
  }
  return items
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

  const awakenings: AvatarAwakeningShopItem[] = []
  if (AVATAR_AWAKENINGS_ENABLED && Array.isArray(row.awakenings)) {
    for (const rawItem of row.awakenings) {
      const parsed = parseAwakeningShopItem(rawItem)
      if (parsed) awakenings.push(parsed)
    }
  }

  const mergedItems = mergeCatalog(items, AVATAR_CATALOG_FALLBACK, equippedAvatarId).map((item) => ({
    ...item,
    awakeningLevel: AVATAR_AWAKENINGS_ENABLED ? (item.awakeningLevel ?? 0) : 0,
  }))

  const equippedFromItems = mergedItems.find((item) => item.id === equippedAvatarId)?.awakeningLevel
  const equippedAwakeningLevel = AVATAR_AWAKENINGS_ENABLED
    ? normalizeAwakeningLevel(row.equipped_awakening_level ?? equippedFromItems ?? 0)
    : 0

  return {
    authenticated: row.authenticated === true,
    balance: asNonNegativeInteger(row.balance),
    equippedAvatarId,
    equippedStageId,
    equippedAwakeningLevel,
    items: mergedItems,
    stages: mergeCatalog(stages, STAGE_CATALOG_FALLBACK, equippedStageId),
    awakenings: AVATAR_AWAKENINGS_ENABLED ? mergeAwakeningCatalog(awakenings) : [],
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
    case 'insufficient_points':
      return 'You do not have enough points yet.'
    case 'not_owned':
      return 'Purchase this item before equipping it.'
    case 'parent_not_owned':
      return 'Unlock this character before buying its awakening.'
    case 'requires_awakening_i':
      return 'You already need the character Awakening unlock.'
    case 'disabled':
      return 'Avatar Awakenings are not available yet.'
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
  const parentItemId = asString(row.parent_item_id) ?? undefined
  const awakeningLevel =
    row.awakening_level === 1 || row.awakening_level === 2
      ? (row.awakening_level as AwakeningLevel)
      : undefined
  return {
    ok: true,
    itemId: resolvedId,
    balance:
      typeof row.balance === 'number' ? asNonNegativeInteger(row.balance) : undefined,
    awakeningLevel,
    parentItemId,
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
