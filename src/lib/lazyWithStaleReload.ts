import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { isStaleAssetError, reloadForStaleAssets } from './staleAssetReload'

/**
 * React.lazy that reloads the page once when a chunk URL died after deploy,
 * instead of surfacing the generic error boundary.
 */
// Match React.lazy's ComponentType<any> constraint so page/mode props stay intact.
export function lazyWithStaleReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      if (isStaleAssetError(error) && reloadForStaleAssets('lazy-import')) {
        // Never resolve while the document is reloading.
        return await new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  }) as LazyExoticComponent<T>
}
