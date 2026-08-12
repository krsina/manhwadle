import { describe, expect, it } from 'vitest'
import {
  getVersusEffect,
  isVersusInlineEffect,
  VERSUS_EFFECTS,
} from './versusEffects'
import { playVersusSound, versusSoundSupported } from './versusSounds'

describe('versus effect catalog', () => {
  it('provides unique preview definitions for every battle moment', () => {
    const ids = VERSUS_EFFECTS.map((effect) => effect.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'countdown',
      'round-start',
      'correct-guess',
      'incorrect-guess',
      'opponent-solved',
      'round-win',
      'round-loss',
      'timeout',
      'answer-reveal',
      'score-change',
      'match-victory',
      'match-defeat',
      'match-draw',
    ])
  })

  it('resolves every catalog entry', () => {
    for (const effect of VERSUS_EFFECTS) {
      expect(getVersusEffect(effect.id)).toBe(effect)
      expect(effect.label).not.toBe('')
      expect(effect.description).not.toBe('')
    }
  })

  it('keeps guess and rival cues inline instead of center popups', () => {
    expect(isVersusInlineEffect('round-start')).toBe(true)
    expect(isVersusInlineEffect('correct-guess')).toBe(true)
    expect(isVersusInlineEffect('incorrect-guess')).toBe(true)
    expect(isVersusInlineEffect('opponent-solved')).toBe(true)
    expect(isVersusInlineEffect('score-change')).toBe(true)
    expect(isVersusInlineEffect('answer-reveal')).toBe(true)
    expect(isVersusInlineEffect('countdown')).toBe(false)
    expect(isVersusInlineEffect('round-win')).toBe(false)
    expect(isVersusInlineEffect('round-loss')).toBe(false)
    expect(isVersusInlineEffect('timeout')).toBe(false)
    expect(isVersusInlineEffect('match-victory')).toBe(false)
    expect(isVersusInlineEffect('match-defeat')).toBe(false)
    expect(isVersusInlineEffect('match-draw')).toBe(false)
  })
})

describe('versus sound playback', () => {
  it('is safe when Web Audio is unavailable', async () => {
    expect(versusSoundSupported()).toBe(false)
    await expect(playVersusSound('round-win')).resolves.toBeUndefined()
  })
})
