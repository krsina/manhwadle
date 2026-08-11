import type { MultiplayerPoolSource } from '../../lib/multiplayerTypes'

export const MULTIPLAYER_POOL_META: Record<
  MultiplayerPoolSource,
  { title: string; detail: string }
> = {
  action: { title: 'Action', detail: 'Random titles from the Action lane.' },
  romance: { title: 'Romance', detail: 'Random titles from the Romance lane.' },
  both: { title: 'Both', detail: 'Random titles from the combined lane.' },
  collaborative_lists: {
    title: 'Collaborative lists',
    detail: 'Play from saved lists. One shared list is enough.',
  },
}

export function multiplayerPoolLabel(source: MultiplayerPoolSource): string {
  return MULTIPLAYER_POOL_META[source].title
}
