import type { Manhwa } from '../lib/anilist-types'
import { catalogRank, catalogTileMeta } from '../lib/catalogBrowse'
import { displayTitle } from '../lib/daily'
import { MediaImage } from './MediaImage'

interface CatalogTileBodyProps {
  manhwa: Manhwa
}

/** Cover-and-copy layout shared by the database grid and the list builder. */
export function CatalogTileBody({ manhwa }: CatalogTileBodyProps) {
  const rank = catalogRank(manhwa)
  const meta = catalogTileMeta(manhwa)
  return (
    <>
      <div className="database-tile-cover-wrap">
        <MediaImage
          className="database-cover"
          src={manhwa.coverImage ?? undefined}
          alt=""
          fallbackLabel="No cover"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="database-tile-copy">
        <span className="database-rank" aria-label={rank ? `Rank ${rank}` : 'Unranked'}>
          {rank ? `Rank ${rank}` : 'Unranked'}
        </span>
        <span className="database-title">{displayTitle(manhwa)}</span>
        {meta.length > 0 && <span className="database-meta">{meta.join(' · ')}</span>}
      </div>
    </>
  )
}
