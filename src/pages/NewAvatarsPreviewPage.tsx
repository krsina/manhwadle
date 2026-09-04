import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PixelAvatar } from '../components/PixelAvatar'
import { AVATAR_CHARACTER_META } from '../lib/avatarComposition'
import {
  keptShortlistExport,
  readNewAvatarShortlist,
  resolveShortlistEntry,
  setShortlistKeep,
  setShortlistRarity,
  shortlistShopPrice,
  shortlistShopRarities,
  toShortlistShopRarity,
  writeNewAvatarShortlist,
  type NewAvatarShortlist,
  type ShortlistShopRarity,
} from '../lib/newAvatarShortlist'
import { HOME_PATH, SHOP_PATH } from '../lib/routes'

/** Everything catalogued after Ember Crown in this session's additions. */
const CUTOVER_ID = 'avatar_ember_crown'

type PlateBackdrop = 'checker' | 'dark' | 'magenta'
type KeepFilter = 'all' | 'kept' | 'dropped'

/**
 * Local DEV / owner temp gallery for newly added Style A characters.
 * Checkerboard default so magenta fringe and matte holes are obvious.
 * Keep + rarity picks persist in localStorage for later ship decisions.
 */
export function NewAvatarsPreviewPage() {
  const [backdrop, setBackdrop] = useState<PlateBackdrop>('checker')
  const [keepFilter, setKeepFilter] = useState<KeepFilter>('all')
  const [shortlist, setShortlist] = useState<NewAvatarShortlist>(readNewAvatarShortlist)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const characters = useMemo(() => {
    const cut = AVATAR_CHARACTER_META.findIndex((row) => row.id === CUTOVER_ID)
    return cut >= 0 ? AVATAR_CHARACTER_META.slice(cut + 1) : []
  }, [])

  useEffect(() => {
    writeNewAvatarShortlist(shortlist)
  }, [shortlist])

  const keptCount = useMemo(
    () =>
      characters.reduce((count, character) => {
        const entry = resolveShortlistEntry(shortlist, character.id, character.rarity)
        return count + (entry.keep ? 1 : 0)
      }, 0),
    [characters, shortlist],
  )

  const visible = useMemo(() => {
    return characters.filter((character) => {
      const entry = resolveShortlistEntry(shortlist, character.id, character.rarity)
      if (keepFilter === 'kept') return entry.keep
      if (keepFilter === 'dropped') return !entry.keep
      return true
    })
  }, [characters, keepFilter, shortlist])

  const keptExport = useMemo(
    () => keptShortlistExport(shortlist, characters),
    [characters, shortlist],
  )

  function updateKeep(characterId: string, catalogRarity: (typeof characters)[number]['rarity'], keep: boolean) {
    setShortlist((current) => setShortlistKeep(current, characterId, catalogRarity, keep))
  }

  function updateRarity(
    characterId: string,
    catalogRarity: (typeof characters)[number]['rarity'],
    rarity: ShortlistShopRarity,
  ) {
    setShortlist((current) => setShortlistRarity(current, characterId, catalogRarity, rarity))
  }

  async function copyKeptJson() {
    const payload = JSON.stringify(keptExport, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      setCopyStatus(`Copied ${keptExport.length} kept avatar${keptExport.length === 1 ? '' : 's'}.`)
    } catch {
      setCopyStatus('Clipboard unavailable — select the JSON below.')
    }
  }

  return (
    <main className="new-avatars-preview">
      <header className="new-avatars-preview-header">
        <p className="modal-kicker">Dev only · temp</p>
        <h1>New avatars</h1>
        <p className="new-avatars-preview-sub">
          {characters.length} plates after Ember Crown · {keptCount} kept · 256×256 Style A
        </p>
        <p className="new-avatars-preview-sub">
          Mark keepers and assign rarity. Choices stay in this browser until you clear site data.
        </p>
        <p className="new-avatars-preview-nav">
          <Link to={SHOP_PATH}>Shop</Link>
          {' · '}
          <Link to={HOME_PATH}>Home</Link>
        </p>
        <div className="new-avatars-preview-controls" role="group" aria-label="Plate backdrop">
          {(
            [
              ['checker', 'Checker'],
              ['dark', 'Dark'],
              ['magenta', 'Magenta'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn ${backdrop === value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setBackdrop(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="new-avatars-preview-controls" role="group" aria-label="Keep filter">
          {(
            [
              ['all', `All (${characters.length})`],
              ['kept', `Kept (${keptCount})`],
              ['dropped', `Not kept (${characters.length - keptCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn ${keepFilter === value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setKeepFilter(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={keptExport.length === 0}
            onClick={() => void copyKeptJson()}
          >
            Copy kept JSON
          </button>
        </div>
        {copyStatus ? (
          <p className="new-avatars-preview-sub" role="status">
            {copyStatus}
          </p>
        ) : null}
      </header>

      {characters.length === 0 ? (
        <p className="new-avatars-preview-empty">No characters after Ember Crown in the catalog.</p>
      ) : visible.length === 0 ? (
        <p className="new-avatars-preview-empty">No avatars in this filter.</p>
      ) : (
        <ul className="new-avatars-preview-grid">
          {visible.map((character) => {
            const entry = resolveShortlistEntry(shortlist, character.id, character.rarity)
            return (
              <li
                key={character.id}
                className={`new-avatars-preview-card${entry.keep ? ' is-kept' : ' is-dropped'}`}
              >
                <div className={`new-avatars-preview-plate is-${backdrop}`} aria-hidden="true">
                  <PixelAvatar characterId={character.id} size="xl" decorative snapCrisp />
                </div>
                <h2>{character.name}</h2>
                <p className="new-avatars-preview-meta">
                  {entry.rarity} · {shortlistShopPrice(entry.rarity).toLocaleString()} pts
                  {entry.rarity !== toShortlistShopRarity(character.rarity)
                    ? ` · was ${character.rarity}`
                    : null}
                </p>
                <div className="new-avatars-preview-curate">
                  <button
                    type="button"
                    className={`btn ${entry.keep ? 'btn-primary' : 'btn-ghost'} new-avatars-keep-btn`}
                    aria-pressed={entry.keep}
                    onClick={() => updateKeep(character.id, character.rarity, !entry.keep)}
                  >
                    {entry.keep ? 'Kept' : 'Keep'}
                  </button>
                  <label className="new-avatars-rarity-label">
                    <span className="visually-hidden">Rarity for {character.name}</span>
                    <select
                      className="new-avatars-rarity-select"
                      value={entry.rarity}
                      onChange={(event) =>
                        updateRarity(
                          character.id,
                          character.rarity,
                          event.target.value as ShortlistShopRarity,
                        )
                      }
                    >
                      {shortlistShopRarities().map((rarity) => (
                        <option key={rarity} value={rarity}>
                          {rarity}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="new-avatars-preview-inspire">
                  <span className="new-avatars-preview-inspire-kicker">Inspired by</span>
                  {character.inspirationSeries}
                  {' · '}
                  {character.inspirationCharacter}
                </p>
                <p className="new-avatars-preview-desc">{character.description}</p>
              </li>
            )
          })}
        </ul>
      )}

      {keptExport.length > 0 ? (
        <section className="new-avatars-export" aria-label="Kept shortlist export">
          <h2>Kept shortlist</h2>
          <pre className="new-avatars-export-json">{JSON.stringify(keptExport, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  )
}
