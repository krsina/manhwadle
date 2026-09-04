import { GACHA_PULL_COST } from '../../lib/gachaWeekly'

export const GACHA_STUDIO_COPY = {
  kicker: 'Banner',
  title: 'Character banner',
  cta: 'Pull x1',
  againCta: 'Pull again',
  spinning: 'Spinning…',
  idle: 'Spend points to pull',
  description: `One pull costs ◆ ${GACHA_PULL_COST} points — clear all four modes in a day to earn one. Featured skins cost several days of play.`,
} as const
