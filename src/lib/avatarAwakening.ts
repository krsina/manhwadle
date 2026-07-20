/**
 * Avatar Awakening: single upgrade per premium avatar.
 * Animation = registered continuous Style A strip (idle → action → return). No CSS bob/FX.
 *
 * PRODUCTION: awakenings are disabled until sprite animation quality is ready.
 * Flip {@link AVATAR_AWAKENINGS_ENABLED} to re-enable shop + sheet playback.
 */

import {
  AVATAR_CHARACTER_META,
  STYLE_A_BASE,
  avatarAssetUrl,
  getAvatarCharacterMeta,
  normalizeEquippedAvatarId,
} from './avatarComposition'

/**
 * Master switch for shop Awakening purchases + sprite-sheet playback.
 * Keep `false` in production until GenerateImage / external animation quality is acceptable.
 * Dev tools (`/dev/animations`, strip preview) are unaffected.
 */
export const AVATAR_AWAKENINGS_ENABLED = false

/** 0 = static plate; 1 = awakened (legacy DB value 2 clamped to 1). */
export type AwakeningLevel = 0 | 1

export interface AvatarAwakeningMeta {
  id: string
  parentItemId: string
  /** Always 1 after the single-Awakening collapse; kept for shop row shape. */
  awakeningTier: 1
  name: string
  description: string
  price: number
  rarity: 'rare' | 'epic'
  assetKey: string
}

export interface AwakenedSheetMeta {
  /** Filename under `/avatar-characters/style-a/awakened/`. */
  file: string
  frames: number
}

export interface AvatarPresentation {
  characterId: string
  src: string
  awakeningLevel: AwakeningLevel
  useSpriteSheet: boolean
  frameCount: number
}

/**
 * Per-avatar continuous strips. Only registered when awakenings are re-enabled;
 * production keeps this empty so nothing under /awakened/ is referenced.
 */
const AWAKENED_SHEETS: Readonly<Record<string, AwakenedSheetMeta>> = {
  // avatar_plum_blossom_blade: { file: 'plum-blossom-blade.png', frames: 26 },
}

/** Existing tier-1 shop price; pricing TBD — do not bikeshed here. */
export const AWAKENING_PRICE = 100
/** @deprecated Use AWAKENING_PRICE — kept for older test imports. */
export const AWAKENING_I_PRICE = AWAKENING_PRICE
/** @deprecated Dual tiers removed. */
export const AWAKENING_II_PRICE = 200

export function normalizeAwakeningLevel(raw: unknown): AwakeningLevel {
  if (raw === 1 || raw === '1' || raw === 2 || raw === '2') return 1
  return 0
}

export function isAwakeningLevel(value: unknown): value is AwakeningLevel {
  return value === 0 || value === 1
}

/** Premium (purchasable) avatars that can receive awakenings. Starters stay static. */
export function isAwakenableAvatar(avatarId: string | null | undefined): boolean {
  const meta = getAvatarCharacterMeta(avatarId)
  return Boolean(meta && !meta.starter && meta.price > 0)
}

export function awakenableAvatarIds(): string[] {
  return AVATAR_CHARACTER_META.filter((row) => !row.starter && row.price > 0).map((row) => row.id)
}

/** Shop item id for the single Awakening (reuses former tier-1 id). */
export function awakeningItemId(parentAvatarId: string): string {
  return `awaken_${parentAvatarId}_1`
}

export function parseAwakeningItemId(
  itemId: string,
): { parentItemId: string; awakeningTier: 1 } | null {
  const match = /^awaken_(avatar_.+)_([12])$/.exec(itemId)
  if (!match) return null
  // Tier-2 ids still parse for legacy rows but map to the single Awakening.
  return { parentItemId: match[1], awakeningTier: 1 }
}

/** Build offline catalog rows: one Awakening per awakenable character. */
export function buildAwakeningCatalogFallback(): AvatarAwakeningMeta[] {
  const rows: AvatarAwakeningMeta[] = []
  for (const avatarId of awakenableAvatarIds()) {
    const meta = getAvatarCharacterMeta(avatarId)
    if (!meta) continue
    rows.push({
      id: awakeningItemId(avatarId),
      parentItemId: avatarId,
      awakeningTier: 1,
      name: 'Awakening',
      description: `Unlock a frame-by-frame idle that flows into a cool action for ${meta.name}.`,
      price: AWAKENING_PRICE,
      rarity: 'rare',
      assetKey: awakeningItemId(avatarId),
    })
  }
  return rows
}

export const AWAKENING_CATALOG_FALLBACK: readonly AvatarAwakeningMeta[] =
  buildAwakeningCatalogFallback()

export function canPurchaseAwakening(args: {
  parentOwned: boolean
  currentLevel: AwakeningLevel | number
  /** Ignored after single-Awakening collapse; kept for call-site compat. */
  tier?: 1 | 2
}): { ok: true } | { ok: false; error: 'parent_not_owned' | 'already_owned' | 'disabled' } {
  if (!AVATAR_AWAKENINGS_ENABLED) return { ok: false, error: 'disabled' }
  if (!args.parentOwned) return { ok: false, error: 'parent_not_owned' }
  if (normalizeAwakeningLevel(args.currentLevel) >= 1) {
    return { ok: false, error: 'already_owned' }
  }
  return { ok: true }
}

export function getAwakenedSheet(avatarId: string): AwakenedSheetMeta | null {
  return AWAKENED_SHEETS[normalizeEquippedAvatarId(avatarId)] ?? null
}

export function hasAwakenedSpriteSheet(avatarId: string): boolean {
  return getAwakenedSheet(avatarId) != null
}

export function awakenedSpriteSheetUrl(avatarId: string): string | null {
  const sheet = getAwakenedSheet(avatarId)
  if (!sheet) return null
  return `${STYLE_A_BASE}/awakened/${sheet.file}?v=14`
}

/**
 * Resolve what PixelAvatar should render when awakening is owned.
 * Sheets animate via JS strip `translateX`; without a registry entry the static plate is used.
 * When {@link AVATAR_AWAKENINGS_ENABLED} is false, always returns the static plate.
 */
export function resolveAvatarPresentation(
  characterId: string | null | undefined,
  awakeningLevel: unknown = 0,
): AvatarPresentation {
  const id = normalizeEquippedAvatarId(characterId)
  let level = AVATAR_AWAKENINGS_ENABLED ? normalizeAwakeningLevel(awakeningLevel) : 0
  if (!isAwakenableAvatar(id)) level = 0

  if (AVATAR_AWAKENINGS_ENABLED && level >= 1) {
    const sheet = getAwakenedSheet(id)
    const src = awakenedSpriteSheetUrl(id)
    if (sheet && src) {
      return {
        characterId: id,
        src,
        awakeningLevel: 1,
        useSpriteSheet: true,
        frameCount: sheet.frames,
      }
    }
  }

  return {
    characterId: id,
    src: avatarAssetUrl(id),
    awakeningLevel: 0,
    useSpriteSheet: false,
    frameCount: 1,
  }
}
