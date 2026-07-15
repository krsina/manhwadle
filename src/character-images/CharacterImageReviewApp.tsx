import { useMemo, useState } from 'react'
import reviewDoc from '../data/character-image-review.json'
import '../styles.css'
import './character-images.css'

type ManhwaRef = {
  id: number
  title: string
  rank: number | null
  role?: string
  idMal?: number | null
}

type EnrichedRow = {
  characterId: number
  characterName: string
  malName: string | null
  malCharacterId: number | null
  idMal: number | null
  source: string
  imageBefore: string
  imageAfter: string | null
  manhwa: ManhwaRef[]
  inGamePool: boolean
}

type PlaceholderRow = {
  characterId: number
  characterName: string
  image: string | null
  manhwa: ManhwaRef[]
  inGamePool?: boolean
  enrichStatus?: string
  inCatalogPlaceholder?: boolean
}

type ReviewDoc = {
  generatedAt: string
  stats: Record<string, number>
  enriched: EnrichedRow[]
  placeholders: PlaceholderRow[]
  gamePoolPlaceholders: PlaceholderRow[]
}

const doc = reviewDoc as ReviewDoc

type Tab = 'enriched' | 'placeholders' | 'game'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function ManhwaList({ items }: { items: ManhwaRef[] }) {
  if (!items.length) return <p className="cir-muted">No linked manhwa</p>
  return (
    <ul className="cir-manhwa-list">
      {items.map((m) => (
        <li key={`${m.id}-${m.role ?? ''}`}>
          {m.rank != null && <span className="cir-rank">#{m.rank}</span>}{' '}
          <strong>{m.title}</strong>
          {m.role && <span className="cir-role">{m.role}</span>}
        </li>
      ))}
    </ul>
  )
}

function ImagePair({
  before,
  after,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: {
  before: string | null
  after: string | null
  beforeLabel?: string
  afterLabel?: string
}) {
  return (
    <div className="cir-images">
      <figure>
        <figcaption>{beforeLabel}</figcaption>
        {before ? (
          <img src={before} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="cir-no-img">none</div>
        )}
      </figure>
      <figure>
        <figcaption>{afterLabel}</figcaption>
        {after ? (
          <img src={after} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="cir-no-img">none</div>
        )}
      </figure>
    </div>
  )
}

export function CharacterImageReviewApp() {
  const [tab, setTab] = useState<Tab>('enriched')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()

  const enriched = useMemo(() => {
    if (!q) return doc.enriched
    return doc.enriched.filter(
      (row) =>
        row.characterName.toLowerCase().includes(q) ||
        (row.malName || '').toLowerCase().includes(q) ||
        row.manhwa.some((m) => m.title.toLowerCase().includes(q)),
    )
  }, [q])

  const placeholders = useMemo(() => {
    if (!q) return doc.placeholders
    return doc.placeholders.filter(
      (row) =>
        row.characterName.toLowerCase().includes(q) ||
        row.manhwa.some((m) => m.title.toLowerCase().includes(q)),
    )
  }, [q])

  const gameRows = useMemo(() => {
    if (!q) return doc.gamePoolPlaceholders
    return doc.gamePoolPlaceholders.filter(
      (row) =>
        row.characterName.toLowerCase().includes(q) ||
        row.manhwa.some((m) => m.title.toLowerCase().includes(q)),
    )
  }, [q])

  const stats = doc.stats

  return (
    <div className="page cir-page">
      <header className="cir-header">
        <div>
          <p className="eyebrow">Data review</p>
          <h1>Character images</h1>
          <p className="cir-lede">
            Placeholders and MAL enrichments from catalog + checkpoint. Generated{' '}
            {formatWhen(doc.generatedAt)}.
          </p>
        </div>
        <div className="cir-stats">
          <div>
            <span className="cir-stat-num">{stats.enriched}</span>
            <span className="cir-stat-label">enriched</span>
          </div>
          <div>
            <span className="cir-stat-num">{stats.catalogPlaceholders}</span>
            <span className="cir-stat-label">catalog placeholders</span>
          </div>
          <div>
            <span className="cir-stat-num">{stats.gamePoolPlaceholders}</span>
            <span className="cir-stat-label">in game pool</span>
          </div>
        </div>
      </header>

      <div className="cir-toolbar">
        <div className="cir-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enriched'}
            className={tab === 'enriched' ? 'is-active' : ''}
            onClick={() => setTab('enriched')}
          >
            Enriched ({enriched.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'placeholders'}
            className={tab === 'placeholders' ? 'is-active' : ''}
            onClick={() => setTab('placeholders')}
          >
            Placeholders ({placeholders.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'game'}
            className={tab === 'game' ? 'is-active' : ''}
            onClick={() => setTab('game')}
          >
            Game pool ({gameRows.length})
          </button>
        </div>
        <input
          className="cir-search"
          type="search"
          placeholder="Filter by character or manhwa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tab === 'enriched' && (
        <section className="cir-grid">
          {enriched.length === 0 && <p className="cir-empty">No enriched characters match.</p>}
          {enriched.map((row) => (
            <article key={row.characterId} className="cir-card">
              <header>
                <h2>{row.characterName}</h2>
                {row.malName && row.malName !== row.characterName && (
                  <p className="cir-sub">
                    MAL: {row.malName}
                    {row.malCharacterId != null && (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          href={`https://myanimelist.net/character/${row.malCharacterId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          MAL #{row.malCharacterId}
                        </a>
                      </>
                    )}
                  </p>
                )}
                <p className="cir-meta">
                  AniList #{row.characterId}
                  {row.inGamePool && <span className="cir-badge">in game pool</span>}
                </p>
              </header>
              <ManhwaList items={row.manhwa} />
              <ImagePair before={row.imageBefore} after={row.imageAfter} />
            </article>
          ))}
        </section>
      )}

      {tab === 'placeholders' && (
        <section className="cir-grid">
          {placeholders.length === 0 && (
            <p className="cir-empty">No catalog placeholders — nice.</p>
          )}
          {placeholders.map((row) => (
            <article key={row.characterId} className="cir-card cir-card--warn">
              <header>
                <h2>{row.characterName}</h2>
                <p className="cir-meta">
                  AniList #{row.characterId}
                  {row.enrichStatus && (
                    <span className="cir-badge cir-badge--muted">{row.enrichStatus}</span>
                  )}
                  {row.inGamePool && <span className="cir-badge">in game pool</span>}
                </p>
              </header>
              <ManhwaList items={row.manhwa} />
              <figure className="cir-single-img">
                <figcaption>Placeholder</figcaption>
                {row.image ? (
                  <img src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="cir-no-img">no image</div>
                )}
              </figure>
            </article>
          ))}
        </section>
      )}

      {tab === 'game' && (
        <section className="cir-grid">
          {gameRows.length === 0 ? (
            <p className="cir-empty">No placeholders in manhwa.json game pool.</p>
          ) : (
            <p className="cir-note">
              These are still attached in <code>src/data/manhwa.json</code>. Re-run{' '}
              <code>npm run sync-data</code> after enrichment to drop them.
            </p>
          )}
          {gameRows.map((row) => (
            <article key={`${row.characterId}-${row.manhwa[0]?.id}`} className="cir-card cir-card--warn">
              <header>
                <h2>{row.characterName}</h2>
                <p className="cir-meta">AniList #{row.characterId}</p>
              </header>
              <ManhwaList items={row.manhwa} />
              <figure className="cir-single-img">
                <figcaption>Current image</figcaption>
                {row.image ? (
                  <img src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="cir-no-img">no image</div>
                )}
              </figure>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
