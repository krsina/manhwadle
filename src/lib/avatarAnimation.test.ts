import { describe, expect, it } from 'vitest'
import {
  AVATAR_CHARACTER_META,
  avatarIdentityPromptLines,
  getAvatarCharacterMeta,
} from './avatarComposition'
import {
  DEFAULT_FRAME_PLAN,
  buildAnimationJob,
  buildDefaultSteps,
  createAnimationDraft,
  jobPackageMarkdown,
  prefersGreenChroma,
  segmentForFrame,
  totalFrames,
} from './avatarAnimation'

describe('avatar inspiration context', () => {
  it('gives every catalog avatar series, character, and traits', () => {
    for (const row of AVATAR_CHARACTER_META) {
      expect(row.inspirationSeries.length).toBeGreaterThan(0)
      expect(row.inspirationCharacter.length).toBeGreaterThan(0)
      expect(row.traits.hair.length).toBeGreaterThan(0)
      expect(row.traits.outfit.length).toBeGreaterThan(0)
      expect(row.traits.props.length).toBeGreaterThan(0)
    }
  })

  it('includes Mount Hua context on Plum Blossom Blade', () => {
    const plum = AVATAR_CHARACTER_META.find((r) => r.id === 'avatar_plum_blossom_blade')
    expect(plum?.inspirationSeries).toMatch(/Mount Hua|murim/i)
    expect(plum?.traits.outfit).toMatch(/White murim/i)
    expect(plum?.traits.outfit).toMatch(/BLACK waist sash/i)
    expect(avatarIdentityPromptLines('avatar_plum_blossom_blade').join(' ')).toMatch(/plum/i)
  })
})

describe('avatarAnimation', () => {
  it('builds default idle/action/return steps from avatar context', () => {
    const steps = buildDefaultSteps('avatar_plum_blossom_blade')
    expect(steps.idle).toMatch(/petal|idle|Ready/i)
    expect(steps.action).toMatch(/Mount Hua|sword|flourish/i)
    expect(steps.return).toMatch(/plate|stance/i)
  })

  it('maps frames onto idle/action/return segments', () => {
    expect(totalFrames(DEFAULT_FRAME_PLAN)).toBe(26)
    expect(segmentForFrame(1)).toBe('idle')
    expect(segmentForFrame(6)).toBe('idle')
    expect(segmentForFrame(7)).toBe('action')
    expect(segmentForFrame(24)).toBe('action')
    expect(segmentForFrame(25)).toBe('return')
    expect(segmentForFrame(26)).toBe('return')
  })

  it('exports GenerateImage-only job: action prompts + composite idle/return', () => {
    const draft = createAnimationDraft('avatar_plum_blossom_blade', 'Plum test')
    const job = buildAnimationJob(draft)
    expect(job.totalFrames).toBe(26)
    expect(job.plateLockedFrames).toEqual([1, 26])
    expect(job.generateImageFrames).toHaveLength(18)
    expect(job.generateImageFrames[0]).toBe(7)
    expect(job.generateImageFrames[17]).toBe(24)
    expect(job.compositeFrames).toContain(1)
    expect(job.compositeFrames).toContain(6)
    expect(job.compositeFrames).toContain(25)
    expect(job.prompts).toHaveLength(18)
    expect(job.prompts[0]?.frame).toBe(7)
    expect(job.prompts[0]?.prompt).toContain('ACTION FRAME 7')
    expect(job.prompts[0]?.prompt).toContain('accept-frame')
    expect(job.prompts[0]?.prompt).toContain('#00FF00')
    expect(job.chromaHex).toBe('#00FF00')
    expect(job.productionWorkflow[0]).toMatch(/GenerateImage-only/i)
    expect(job.processHint).toMatch(/idle-composite|accept-frame/i)

    const md = jobPackageMarkdown(job)
    expect(md).toMatch(/Production workflow \(GenerateImage-only\)/)
    expect(md).toMatch(/accept-frame/)
    expect(md).toMatch(/Draft-only/)
  })

  it('prefers green chroma for pink/plum FX avatars', () => {
    const plum = getAvatarCharacterMeta('avatar_plum_blossom_blade')!
    expect(prefersGreenChroma(plum)).toBe(true)
    const shadow = getAvatarCharacterMeta('avatar_shadow_hunter')
    if (shadow) expect(prefersGreenChroma(shadow)).toBe(false)
  })

  it('exports wardrobe and registration hard locks on every action prompt', () => {
    const draft = createAnimationDraft('avatar_plum_blossom_blade')
    const job = buildAnimationJob(draft)
    for (const row of job.prompts) {
      expect(row.segment).toBe('action')
      expect(row.prompt).toContain('WARDROBE:')
      expect(row.prompt).toContain('FEET / ROOT:')
      expect(row.prompt).toContain('REFERENCE ORDER:')
      expect(row.prompt).toContain('#00FF00')
    }
  })
})
