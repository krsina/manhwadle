import type { Manhwa } from './anilist-types'
import { isStaleAssetError, reloadForStaleAssets } from './staleAssetReload'

let catalogPromise: Promise<Manhwa[]> | null = null

/** Lazy-load the compact player catalog (separate network chunk). */
export function loadClientCatalog(): Promise<Manhwa[]> {
  if (!catalogPromise) {
    catalogPromise = import('../data/client-catalog.json')
      .then((mod) => (mod.default ?? mod) as Manhwa[])
      .catch((error) => {
        catalogPromise = null
        if (isStaleAssetError(error) && reloadForStaleAssets('client-catalog')) {
          return new Promise<Manhwa[]>(() => {})
        }
        throw error
      })
  }
  return catalogPromise
}
