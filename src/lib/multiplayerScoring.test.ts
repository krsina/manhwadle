import { describe, expect, it } from 'vitest'
import {
  MULTIPLAYER_ROUND_MS,
  multiplayerRoundScore,
} from './multiplayerScoring'

describe('multiplayerRoundScore', () => {
  it('mirrors the database guess and speed multipliers', () => {
    expect(multiplayerRoundScore(1, 0)).toBe(1000)
    expect(multiplayerRoundScore(2, 90_000)).toBe(417)
    expect(multiplayerRoundScore(6, MULTIPLAYER_ROUND_MS)).toBe(17)
  })

  it('clamps forged inputs to server bounds', () => {
    expect(multiplayerRoundScore(0, -1)).toBe(1000)
    expect(multiplayerRoundScore(99, 999_999)).toBe(17)
  })
})
