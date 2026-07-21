import catalogConfig from '../../catalog.config.json'

/** Popularity-ranked source band. Change `catalog.config.json` and re-sync to adjust. */
export const CATALOG_TOP_N: number = Number(catalogConfig.topN) || 1000

/** AniList ids permanently dropped from the shipped catalog. */
export const CATALOG_EXCLUDE_IDS: readonly number[] = Array.isArray(catalogConfig.excludeIds)
  ? catalogConfig.excludeIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
  : []

/** Expected shipped title count after exclusions. */
export const CATALOG_SIZE: number = Math.max(0, CATALOG_TOP_N - CATALOG_EXCLUDE_IDS.length)
