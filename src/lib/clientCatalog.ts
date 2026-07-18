import type { Manhwa } from './anilist-types'

let catalogPromise: Promise<Manhwa[]> | null = null

/** Lazy-load the compact player catalog (separate network chunk). */
export function loadClientCatalog(): Promise<Manhwa[]> {
  if (!catalogPromise) {
    catalogPromise = import('../data/client-catalog.json').then(
      (mod) => (mod.default ?? mod) as Manhwa[],
    )
  }
  return catalogPromise
}
