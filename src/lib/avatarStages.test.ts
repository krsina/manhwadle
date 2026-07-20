import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AVATAR_STAGE_META,
  DEFAULT_STAGE_ID,
  STAGE_A_BASE,
  avatarStageCssUrl,
  avatarStageUrl,
  defaultStageMeta,
  getAvatarStageMeta,
  normalizeEquippedStageId,
  starterStageIds,
} from './avatarStages'

describe('avatarStages', () => {
  it('exposes three Style A stages with blossom courtyard as free default', () => {
    expect(AVATAR_STAGE_META).toHaveLength(3)
    expect(AVATAR_STAGE_META.map((stage) => stage.id)).toEqual([
      'stage_blossom_courtyard',
      'stage_sky_meadow',
      'stage_dusk_plaza',
    ])
    expect(DEFAULT_STAGE_ID).toBe('stage_blossom_courtyard')
    expect(AVATAR_STAGE_META.filter((stage) => stage.starter)).toHaveLength(1)
    expect(defaultStageMeta().id).toBe('stage_blossom_courtyard')
    expect(starterStageIds()).toEqual(['stage_blossom_courtyard'])
  })

  it('prices paid stages and marks Sky Meadow as limited-time free', () => {
    expect(getAvatarStageMeta('stage_sky_meadow')).toMatchObject({
      price: 0,
      rarity: 'common',
      starter: false,
      limitedTime: true,
    })
    expect(getAvatarStageMeta('stage_dusk_plaza')).toMatchObject({
      price: 2500,
      rarity: 'rare',
    })
  })

  it('resolves stage URLs and falls back safely', () => {
    expect(avatarStageUrl()).toBe(`${STAGE_A_BASE}/blossom-courtyard.png?v=1`)
    expect(avatarStageUrl('stage_sky_meadow')).toBe(`${STAGE_A_BASE}/sky-meadow.png?v=1`)
    expect(avatarStageUrl('not-a-stage')).toBe(avatarStageUrl(DEFAULT_STAGE_ID))
    expect(normalizeEquippedStageId(null)).toBe(DEFAULT_STAGE_ID)
    expect(avatarStageCssUrl(DEFAULT_STAGE_ID)).toBe(
      `url('${STAGE_A_BASE}/blossom-courtyard.png?v=1')`,
    )
    expect(getAvatarStageMeta(null)).toBeNull()
  })

  it('ships the stage files on disk', () => {
    for (const stage of AVATAR_STAGE_META) {
      const filePath = path.resolve('public/avatar-stages/style-a', stage.assetPath)
      expect(fs.existsSync(filePath), `missing ${stage.assetPath}`).toBe(true)
    }
  })
})
