/** Style A avatar stage backdrops (MapleStory-adjacent scenic plates). */

import type { AvatarRarity } from './avatarComposition'

export const STAGE_A_BASE = '/avatar-stages/style-a'

/** Shop item id for the free default stage. */
export const DEFAULT_STAGE_ID = 'stage_blossom_courtyard'

export interface AvatarStageMeta {
  id: string
  slug: string
  name: string
  description: string
  assetPath: string
  assetKey: string
  starter: boolean
  price: number
  rarity: AvatarRarity
}

export const AVATAR_STAGE_META: readonly AvatarStageMeta[] = [
  {
    id: 'stage_blossom_courtyard',
    slug: 'blossom-courtyard',
    name: 'Blossom Courtyard',
    description: 'Murim courtyard with blossom trees and a clear stone path.',
    assetPath: 'blossom-courtyard.png',
    assetKey: 'stage_blossom_courtyard',
    starter: true,
    price: 0,
    rarity: 'common',
  },
  {
    id: 'stage_sky_meadow',
    slug: 'sky-meadow',
    name: 'Sky Meadow',
    description: 'Pastoral meadow under a bright pixel sky.',
    assetPath: 'sky-meadow.png',
    assetKey: 'stage_sky_meadow',
    starter: false,
    price: 100,
    rarity: 'rare',
  },
  {
    id: 'stage_dusk_plaza',
    slug: 'dusk-plaza',
    name: 'Dusk Plaza',
    description: 'Quiet dusk plaza with warm shop-window glow.',
    assetPath: 'dusk-plaza.png',
    assetKey: 'stage_dusk_plaza',
    starter: false,
    price: 100,
    rarity: 'rare',
  },
] as const

const STAGE_BY_ID = new Map(AVATAR_STAGE_META.map((stage) => [stage.id, stage]))

export function getAvatarStageMeta(id: string | null | undefined): AvatarStageMeta | null {
  if (!id) return null
  return STAGE_BY_ID.get(id) ?? null
}

export function defaultStageMeta(): AvatarStageMeta {
  return STAGE_BY_ID.get(DEFAULT_STAGE_ID) ?? AVATAR_STAGE_META[0]!
}

export function normalizeEquippedStageId(raw: unknown): string {
  return typeof raw === 'string' && STAGE_BY_ID.has(raw) ? raw : DEFAULT_STAGE_ID
}

export function starterStageIds(): string[] {
  return AVATAR_STAGE_META.filter((stage) => stage.starter).map((stage) => stage.id)
}

/** Public URL for a stage plate; unknown ids fall back to the default courtyard. */
export function avatarStageUrl(id: string | null | undefined = DEFAULT_STAGE_ID): string {
  const meta = getAvatarStageMeta(id) ?? defaultStageMeta()
  return `${STAGE_A_BASE}/${meta.assetPath}?v=1`
}

/** Inline style value for `--avatar-stage-url` on `.avatar-stage-well`. */
export function avatarStageCssUrl(id: string | null | undefined = DEFAULT_STAGE_ID): string {
  return `url('${avatarStageUrl(id)}')`
}
