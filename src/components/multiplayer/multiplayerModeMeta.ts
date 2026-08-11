import { characterModeMeta } from '../../modes/character/config'
import { coverModeMeta } from '../../modes/cover/config'
import { heardleModeMeta } from '../../modes/heardle/config'
import { summaryModeMeta } from '../../modes/summary/config'
import type { MultiplayerMode } from '../../lib/multiplayerTypes'

interface MultiplayerModeMeta {
  label: string
  /** Short Versus-flavoured blurb; the daily taglines say "today's manhwa". */
  blurb: string
  presentationKey: string
}

export const MULTIPLAYER_MODE_META: Record<MultiplayerMode, MultiplayerModeMeta> = {
  summary: {
    label: summaryModeMeta.name,
    blurb: 'Story blurbs unlock as guesses miss.',
    presentationKey: summaryModeMeta.presentationKey,
  },
  character: {
    label: characterModeMeta.name,
    blurb: 'A character still zooms out over time.',
    presentationKey: characterModeMeta.presentationKey,
  },
  cover: {
    label: coverModeMeta.name,
    blurb: 'A cover crop widens with every miss.',
    presentationKey: coverModeMeta.presentationKey,
  },
  heardle: {
    label: heardleModeMeta.name,
    blurb: 'Song clips grow longer as you guess.',
    presentationKey: heardleModeMeta.presentationKey,
  },
}

export function multiplayerModeLabel(mode: string): string {
  return MULTIPLAYER_MODE_META[mode as MultiplayerMode]?.label ?? mode
}

export function multiplayerModeGlyphKey(mode: string): string {
  return MULTIPLAYER_MODE_META[mode as MultiplayerMode]?.presentationKey ?? mode
}
