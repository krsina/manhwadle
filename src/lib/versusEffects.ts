export type VersusEffectId =
  | 'countdown'
  | 'round-start'
  | 'correct-guess'
  | 'incorrect-guess'
  | 'opponent-solved'
  | 'round-win'
  | 'round-loss'
  | 'timeout'
  | 'answer-reveal'
  | 'score-change'
  | 'match-victory'
  | 'match-defeat'
  | 'match-draw'

export type VersusEffectTone = 'blue' | 'green' | 'red' | 'gold' | 'violet'

export interface VersusEffectDefinition {
  id: VersusEffectId
  label: string
  eyebrow: string
  message: string
  description: string
  tone: VersusEffectTone
}

export const VERSUS_EFFECTS: readonly VersusEffectDefinition[] = [
  {
    id: 'countdown',
    label: 'Countdown',
    eyebrow: 'Match begins',
    message: '3',
    description: 'A focused energy ring and rising ready tick.',
    tone: 'blue',
  },
  {
    id: 'round-start',
    label: 'Round start',
    eyebrow: 'Round 2 of 4',
    message: 'Fight!',
    description: 'Audible start sting when the round opens; no board overlay.',
    tone: 'blue',
  },
  {
    id: 'correct-guess',
    label: 'Correct guess',
    eyebrow: 'Answer locked',
    message: 'Correct',
    description: 'The solved row settles into green with a soft local halo.',
    tone: 'green',
  },
  {
    id: 'incorrect-guess',
    label: 'Incorrect guess',
    eyebrow: 'Guess registered',
    message: 'Not this one',
    description: 'The latest row briefly warms red without shaking the board.',
    tone: 'red',
  },
  {
    id: 'opponent-solved',
    label: 'Opponent solved',
    eyebrow: 'Rival update',
    message: 'Mina solved',
    description: 'Their seat glows green, then settles into the same solved border.',
    tone: 'green',
  },
  {
    id: 'round-win',
    label: 'Round win',
    eyebrow: '+1,250 points',
    message: 'Round secured',
    description: 'Green sparks, score lift, and a decisive solve sting.',
    tone: 'green',
  },
  {
    id: 'round-loss',
    label: 'Round loss',
    eyebrow: 'Round complete',
    message: 'Rival takes it',
    description: 'A brief red vignette that keeps the next round in focus.',
    tone: 'red',
  },
  {
    id: 'timeout',
    label: 'Time expired',
    eyebrow: 'Round complete',
    message: 'Out of time',
    description: 'A draining clock ring and short low resolve.',
    tone: 'red',
  },
  {
    id: 'answer-reveal',
    label: 'Answer reveal',
    eyebrow: 'The answer was',
    message: 'Omniscient Reader',
    description: 'Intermission shows the answer plus every player’s guesses.',
    tone: 'blue',
  },
  {
    id: 'score-change',
    label: 'Lead change',
    eyebrow: 'Standings updated',
    message: 'You take the lead',
    description: 'A restrained gold underline and score glow mark the new lead.',
    tone: 'gold',
  },
  {
    id: 'match-victory',
    label: 'Match victory',
    eyebrow: 'Final result',
    message: 'Victory',
    description: 'Crown, spotlight, particles, and the full victory fanfare.',
    tone: 'gold',
  },
  {
    id: 'match-defeat',
    label: 'Match defeat',
    eyebrow: 'Final result',
    message: 'Defeat',
    description: 'A calm desaturated close with a low musical resolve.',
    tone: 'red',
  },
  {
    id: 'match-draw',
    label: 'Match draw',
    eyebrow: 'Final result',
    message: 'Dead heat',
    description: 'Balanced split light and a neutral completed cadence.',
    tone: 'violet',
  },
] as const

const EFFECT_BY_ID = new Map<VersusEffectId, VersusEffectDefinition>(
  VERSUS_EFFECTS.map((effect) => [effect.id, effect]),
)

export function getVersusEffect(id: VersusEffectId): VersusEffectDefinition {
  return EFFECT_BY_ID.get(id) ?? VERSUS_EFFECTS[0]!
}

/** Cues that decorate the board/roster (or intermission reveal) instead of a center popup. */
export const VERSUS_INLINE_EFFECTS = new Set<VersusEffectId>([
  'round-start',
  'correct-guess',
  'incorrect-guess',
  'opponent-solved',
  'score-change',
  'answer-reveal',
])

export function isVersusInlineEffect(id: VersusEffectId): boolean {
  return VERSUS_INLINE_EFFECTS.has(id)
}
