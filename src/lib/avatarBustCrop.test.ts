import { describe, expect, it, beforeEach } from 'vitest'
import {
  DEFAULT_AVATAR_BUST_CROP,
  clearAvatarBustCropDrafts,
  formatAvatarBustCropsTypeScript,
  getAvatarBustCrop,
  normalizeAvatarBustCrop,
  resetAvatarBustCropDraftCacheForTests,
  setAvatarBustCropDraft,
} from './avatarBustCrop'

describe('avatarBustCrop', () => {
  beforeEach(() => {
    resetAvatarBustCropDraftCacheForTests()
    clearAvatarBustCropDrafts()
  })

  it('falls back to the default crop', () => {
    expect(getAvatarBustCrop('avatar_shadow_hunter')).toEqual(DEFAULT_AVATAR_BUST_CROP)
  })

  it('clamps invalid numbers', () => {
    expect(
      normalizeAvatarBustCrop({ focusX: 140, focusY: -5, scale: 9 }),
    ).toEqual({ focusX: 100, focusY: 0, scale: 4.5 })
  })

  it('stores draft overrides and formats TypeScript for commit', () => {
    setAvatarBustCropDraft('avatar_shadow_hunter', {
      focusX: 48,
      focusY: 12,
      scale: 2.2,
    })
    expect(getAvatarBustCrop('avatar_shadow_hunter')).toMatchObject({
      focusX: 48,
      focusY: 12,
      scale: 2.2,
    })
    const ts = formatAvatarBustCropsTypeScript()
    expect(ts).toContain('avatar_shadow_hunter:')
    expect(ts).toContain('focusY: 12')
  })
})
