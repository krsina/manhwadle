import { useDeferredValue, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import characterCropData from '../data/characterCrop.json'
import manhwaData from '../data/manhwa.json'
import storyBlurbData from '../data/storyDescriptionBlurb.json'
import {
  characterImageUrl,
  isCharacterEnabledForGuess,
  type Manhwa,
} from '../lib/anilist-types'
import type { StoryDescriptionBlurbFile } from '../lib/blurbs'
import {
  findCharacterCrop,
  groupCropsByManhwa,
  type CharacterCropEntry,
  type CharacterCropFile,
} from '../lib/crops'
import { applyTheme, loadTheme } from '../lib/theme'
import { saveLibraryToDisk } from './api'
import { CharacterEditModal } from './CharacterEditModal'
import { downloadDbExport, downloadGameFiles, toGameFiles } from './export'
import {
  cloneBlurb,
  cloneManhwa,
  displayName,
  type LibraryRecord,
} from './types'
import './library.css'

applyTheme(loadTheme())

const initialManhwa = manhwaData as Manhwa[]
const initialBlurbs = storyBlurbData as StoryDescriptionBlurbFile
const initialCrops = characterCropData as CharacterCropFile

function buildRecords(
  manhwaList: Manhwa[],
  blurbDoc: StoryDescriptionBlurbFile,
  cropDoc: CharacterCropFile,
): LibraryRecord[] {
  const blurbsById = new Map(blurbDoc.entries.map((entry) => [entry.manhwaId, entry]))
  const cropsByManhwa = groupCropsByManhwa(cropDoc)
  return manhwaList.map((manhwa) => ({
    manhwa: cloneManhwa(manhwa),
    blurb: blurbsById.has(manhwa.id) ? structuredClone(blurbsById.get(manhwa.id)!) : null,
    crops: structuredClone(cropsByManhwa.get(manhwa.id) || []),
  }))
}

type LibrarySort = 'rank' | 'name'

function sortRecords(records: LibraryRecord[], sort: LibrarySort): LibraryRecord[] {
  const next = [...records]
  if (sort === 'name') {
    next.sort((a, b) => displayName(a.manhwa).localeCompare(displayName(b.manhwa)))
    return next
  }
  next.sort((a, b) => {
    const rankA = a.blurb?.rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.blurb?.rank ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    return displayName(a.manhwa).localeCompare(displayName(b.manhwa))
  })
  return next
}

function matchesQuery(record: LibraryRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const { manhwa, blurb } = record
  const characterBits = (manhwa.characters || []).flatMap((character) => [
    character.name.full,
    character.name.native,
    ...(character.name.alternative || []),
    String(character.id),
  ])
  const haystack = [
    String(manhwa.id),
    manhwa.title.english,
    manhwa.title.romaji,
    manhwa.title.native,
    blurb?.title,
    ...manhwa.synonyms,
    ...manhwa.genres,
    ...characterBits,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function listLabel(value: string[]): string {
  return value.join(', ')
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function LibraryApp() {
  const [records, setRecords] = useState(() =>
    buildRecords(initialManhwa, initialBlurbs, initialCrops),
  )
  const [blurbMeta] = useState(() => initialBlurbs.meta)
  const [cropMeta] = useState(() => initialCrops.meta)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<LibrarySort>('rank')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(() => new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const matched = records.filter((record) => matchesQuery(record, deferredQuery))
    return sortRecords(matched, sort)
  }, [records, deferredQuery, sort])

  const selected =
    records.find((record) => record.manhwa.id === selectedId) ??
    filtered[0] ??
    null

  const activeId = selected?.manhwa.id ?? null

  function markDirty(id: number) {
    setDirtyIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function updateSelected(mutator: (record: LibraryRecord) => LibraryRecord) {
    if (!selected) return
    const id = selected.manhwa.id
    setRecords((prev) =>
      prev.map((record) => (record.manhwa.id === id ? mutator(record) : record)),
    )
    markDirty(id)
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const payload = toGameFiles(records, blurbMeta, cropMeta)
      const result = await saveLibraryToDisk(payload)
      if (!result.ok) {
        setStatus(result.error || 'Save failed')
        return
      }
      setDirtyIds(new Set())
      setStatus(
        `Saved ${result.saved?.manhwa ?? 0} manhwa, ${result.saved?.blurbs ?? 0} blurbs, ${result.saved?.crops ?? 0} crops to src/data`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="library-shell">
      <header className="library-topbar">
        <div>
          <p className="library-kicker">Dev only</p>
          <h1 className="library-title">Manhwa Library</h1>
          <p className="library-subtitle">
            Browse, search, and edit titles, cast, summaries, and character crops. Save writes to{' '}
            <code>src/data</code> during <code>npm run dev</code>.
          </p>
        </div>
        <div className="library-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadGameFiles(records, blurbMeta, cropMeta)}
          >
            Download game JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadDbExport(records)}
          >
            Download DB JSON
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || dirtyIds.size === 0 || !import.meta.env.DEV}
            onClick={handleSave}
            title={
              import.meta.env.DEV
                ? 'Write manhwa.json, storyDescriptionBlurb.json, characterCrop.json'
                : 'Saving to disk only works in npm run dev'
            }
          >
            {saving ? 'Saving…' : `Save to disk${dirtyIds.size ? ` (${dirtyIds.size})` : ''}`}
          </button>
        </div>
      </header>

      {status && <p className="library-status">{status}</p>}

      <div className="library-layout">
        <aside className="library-sidebar">
          <label className="library-search">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, character, synonym, genre, or id…"
            />
          </label>
          <div className="library-sort" role="group" aria-label="Sort library">
            <button
              type="button"
              className={`library-sort-btn${sort === 'rank' ? ' is-active' : ''}`}
              onClick={() => setSort('rank')}
            >
              Rank
            </button>
            <button
              type="button"
              className={`library-sort-btn${sort === 'name' ? ' is-active' : ''}`}
              onClick={() => setSort('name')}
            >
              Name
            </button>
          </div>
          <p className="library-count">
            {filtered.length} of {records.length}
            {dirtyIds.size > 0 ? ` · ${dirtyIds.size} edited` : ''}
          </p>
          <ul className="library-list">
            {filtered.map((record) => {
              const active = record.manhwa.id === activeId
              const dirty = dirtyIds.has(record.manhwa.id)
              return (
                <li key={record.manhwa.id}>
                  <button
                    type="button"
                    className={`library-card${active ? ' is-active' : ''}${dirty ? ' is-dirty' : ''}`}
                    onClick={() => setSelectedId(record.manhwa.id)}
                  >
                    {record.manhwa.coverImage ? (
                      <img
                        src={record.manhwa.coverImage}
                        alt=""
                        className="library-card-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="library-card-cover is-empty" />
                    )}
                    <span className="library-card-copy">
                      <span className="library-card-title">{displayName(record.manhwa)}</span>
                      <span className="library-card-meta">
                        #{record.manhwa.id}
                        {record.blurb?.rank != null ? ` · rank ${record.blurb.rank}` : ''}
                        {record.manhwa.characters?.length
                          ? ` · ${record.manhwa.characters.length} chars`
                          : ''}
                        {record.crops.some((c) => c.imageUrl?.trim())
                          ? ` · ${record.crops.filter((c) => c.imageUrl?.trim()).length} crop${record.crops.filter((c) => c.imageUrl?.trim()).length === 1 ? '' : 's'}`
                          : ''}
                        {dirty ? ' · edited' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="library-editor">
          {!selected ? (
            <p className="library-empty">Select a title to edit.</p>
          ) : (
            <EditorForm
              key={selected.manhwa.id}
              record={selected}
              onChange={updateSelected}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function EditorForm({
  record,
  onChange,
}: {
  record: LibraryRecord
  onChange: (mutator: (record: LibraryRecord) => LibraryRecord) => void
}) {
  const { manhwa, blurb, crops } = record
  const ensuredBlurb = cloneBlurb(blurb, manhwa)
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<Set<number>>(() => new Set())
  const [editingCharacterId, setEditingCharacterId] = useState<number | null>(null)

  function patchManhwa(partial: Partial<Manhwa>) {
    onChange((current) => ({
      ...current,
      manhwa: { ...current.manhwa, ...partial },
    }))
  }

  function patchTitle(partial: Partial<Manhwa['title']>) {
    onChange((current) => ({
      ...current,
      manhwa: {
        ...current.manhwa,
        title: { ...current.manhwa.title, ...partial },
      },
    }))
  }

  function patchBlurb(
    mutator: (entry: NonNullable<LibraryRecord['blurb']>) => NonNullable<LibraryRecord['blurb']>,
  ) {
    onChange((current) => ({
      ...current,
      blurb: mutator(cloneBlurb(current.blurb, current.manhwa)),
    }))
  }

  const characters = manhwa.characters || []
  const enabledCount = characters.filter((c) => isCharacterEnabledForGuess(c)).length
  const editingCharacter =
    editingCharacterId == null
      ? null
      : characters.find((character) => character.id === editingCharacterId) || null

  function patchCharacterFlags(ids: number[], useForGuess: boolean) {
    const idSet = new Set(ids)
    onChange((current) => ({
      ...current,
      manhwa: {
        ...current.manhwa,
        characters: (current.manhwa.characters || []).map((character) =>
          idSet.has(character.id) ? { ...character, useForGuess } : character,
        ),
      },
    }))
  }

  function setAllCharacterGuessFlags(useForGuess: boolean) {
    onChange((current) => ({
      ...current,
      manhwa: {
        ...current.manhwa,
        characters: (current.manhwa.characters || []).map((character) => ({
          ...character,
          useForGuess,
        })),
      },
    }))
  }

  function upsertCharacterCrop(crop: CharacterCropEntry) {
    onChange((current) => {
      const without = (current.crops || []).filter(
        (entry) => entry.characterId !== crop.characterId,
      )
      return { ...current, crops: [...without, crop] }
    })
  }

  function removeCharacterCrop(characterId: number) {
    onChange((current) => ({
      ...current,
      crops: (current.crops || []).filter((entry) => entry.characterId !== characterId),
    }))
  }

  function onCharacterClick(event: MouseEvent, index: number) {
    event.preventDefault()
    const clicked = characters[index]
    if (!clicked) return

    const nextValue = !isCharacterEnabledForGuess(clicked)

    if (event.shiftKey && anchorIndex != null) {
      const from = Math.min(anchorIndex, index)
      const to = Math.max(anchorIndex, index)
      const rangeIds = characters.slice(from, to + 1).map((c) => c.id)
      patchCharacterFlags(rangeIds, nextValue)
      setHighlight(new Set(characters.slice(from, to + 1).map((c) => c.id)))
      return
    }

    if (event.ctrlKey || event.metaKey) {
      patchCharacterFlags([clicked.id], nextValue)
      setAnchorIndex(index)
      setHighlight((prev) => {
        const next = new Set(prev)
        if (next.has(clicked.id)) next.delete(clicked.id)
        else next.add(clicked.id)
        return next
      })
      return
    }

    patchCharacterFlags([clicked.id], nextValue)
    setAnchorIndex(index)
    setHighlight(new Set([clicked.id]))
  }

  return (
    <div className="editor">
      <div className="editor-hero">
        {manhwa.coverImage && (
          <img className="editor-cover" src={manhwa.coverImage} alt="" />
        )}
        <div>
          <p className="editor-kicker">Editing</p>
          <h2 className="editor-title">{displayName(manhwa)}</h2>
          <p className="editor-id">
            AniList #{manhwa.id}
            {ensuredBlurb.rank != null ? ` · rank ${ensuredBlurb.rank}` : ''}
          </p>
          <a className="editor-link" href={manhwa.siteUrl} target="_blank" rel="noreferrer">
            Open on AniList
          </a>
        </div>
      </div>

      <section className="editor-section">
        <h3>Titles</h3>
        <div className="editor-grid">
          <Field label="English">
            <input
              value={manhwa.title.english ?? ''}
              onChange={(e) => patchTitle({ english: e.target.value || null })}
            />
          </Field>
          <Field label="Romaji">
            <input
              value={manhwa.title.romaji ?? ''}
              onChange={(e) => patchTitle({ romaji: e.target.value || null })}
            />
          </Field>
          <Field label="Native">
            <input
              value={manhwa.title.native ?? ''}
              onChange={(e) => patchTitle({ native: e.target.value || null })}
            />
          </Field>
          <Field label="Blurb display title">
            <input
              value={ensuredBlurb.title ?? ''}
              onChange={(e) =>
                patchBlurb((entry) => ({ ...entry, title: e.target.value }))
              }
            />
          </Field>
        </div>
      </section>

      <section className="editor-section">
        <h3>Metadata</h3>
        <div className="editor-grid">
          <Field label="Status">
            <select
              value={manhwa.status}
              onChange={(e) => patchManhwa({ status: e.target.value })}
            >
              {['Ongoing', 'Completed', 'Hiatus', 'Cancelled', 'Not yet released', 'Unknown'].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Start year">
            <input
              type="number"
              value={manhwa.startDate.year ?? ''}
              onChange={(e) =>
                patchManhwa({
                  startDate: {
                    ...manhwa.startDate,
                    year: e.target.value === '' ? null : Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Rank">
            <input
              type="number"
              value={ensuredBlurb.rank ?? ''}
              onChange={(e) =>
                patchBlurb((entry) => ({
                  ...entry,
                  rank: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Cover image URL">
            <input
              value={manhwa.coverImage ?? ''}
              onChange={(e) => patchManhwa({ coverImage: e.target.value || null })}
            />
          </Field>
        </div>
      </section>

      <section className="editor-section">
        <h3>Lists</h3>
        <Field label="Synonyms (comma or newline separated)">
          <textarea
            rows={4}
            value={listLabel(manhwa.synonyms)}
            onChange={(e) => patchManhwa({ synonyms: parseList(e.target.value) })}
          />
        </Field>
        <Field label="Genres">
          <textarea
            rows={2}
            value={listLabel(manhwa.genres)}
            onChange={(e) => patchManhwa({ genres: parseList(e.target.value) })}
          />
        </Field>
        <Field label="Tags">
          <textarea
            rows={3}
            value={listLabel(manhwa.tags)}
            onChange={(e) => patchManhwa({ tags: parseList(e.target.value) })}
          />
        </Field>
      </section>

      <section className="editor-section">
        <h3>Descriptions</h3>
        <Field label="Publisher description (final unlock)">
          <textarea
            rows={8}
            value={manhwa.description}
            onChange={(e) => patchManhwa({ description: e.target.value })}
          />
        </Field>
        <Field label="Summary clue t0">
          <textarea
            rows={4}
            value={ensuredBlurb.storyDescriptionBlurb.t0}
            onChange={(e) =>
              patchBlurb((entry) => ({
                ...entry,
                storyDescriptionBlurb: {
                  ...entry.storyDescriptionBlurb,
                  t0: e.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="Summary clue t1">
          <textarea
            rows={4}
            value={ensuredBlurb.storyDescriptionBlurb.t1}
            onChange={(e) =>
              patchBlurb((entry) => ({
                ...entry,
                storyDescriptionBlurb: {
                  ...entry.storyDescriptionBlurb,
                  t1: e.target.value,
                },
              }))
            }
          />
        </Field>
      </section>

      <section className="editor-section">
        <div className="editor-section-heading">
          <div>
            <h3>Characters</h3>
            <p className="editor-help">
              Grid of the AniList cast. All are <strong>included</strong> for Character-mode
              guesses by default. Click a tile to toggle include/exclude; use{' '}
              <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> or <kbd>Shift</kbd> for multi-select. Open{' '}
              <strong>Edit</strong> for details and crop focus.
            </p>
          </div>
          {characters.length > 0 && (
            <div className="character-toolbar">
              <span className="character-toolbar-count">
                {enabledCount}/{characters.length} included
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAllCharacterGuessFlags(true)}
              >
                Include all
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAllCharacterGuessFlags(false)}
              >
                Exclude all
              </button>
            </div>
          )}
        </div>
        {characters.length === 0 ? (
          <p className="editor-help">
            No characters attached. Re-run <code>npm run sync-data</code>.
          </p>
        ) : (
          <ul className="character-grid" role="list">
            {characters.map((character, index) => {
              const enabled = isCharacterEnabledForGuess(character)
              const imageUrl = characterImageUrl(character)
              const label =
                character.name.full ||
                character.name.native ||
                `Character #${character.id}`
              const highlighted = highlight.has(character.id)
              const hasCrop = Boolean(findCharacterCrop(crops, character.id)?.imageUrl?.trim())

              return (
                <li key={character.id} className="character-tile-wrap">
                  <button
                    type="button"
                    className={[
                      'character-tile',
                      enabled ? 'is-included' : 'is-excluded',
                      highlighted ? 'is-highlighted' : '',
                      hasCrop ? 'has-crop' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={(event) => onCharacterClick(event, index)}
                    title={
                      enabled
                        ? 'Included for guesses — click to exclude'
                        : 'Excluded from guesses — click to include'
                    }
                  >
                    {imageUrl ? (
                      <img
                        className="character-tile-image"
                        src={imageUrl}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="character-tile-image is-empty">No image</div>
                    )}
                    <span className="character-tile-meta">
                      <span className="character-tile-name">{label}</span>
                      <span className={`character-role role-${character.role.toLowerCase()}`}>
                        {character.role}
                      </span>
                    </span>
                    <span className="character-tile-flag">
                      {enabled ? 'Included' : 'Excluded'}
                      {hasCrop ? ' · Crop' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost character-tile-edit"
                    onClick={() => setEditingCharacterId(character.id)}
                  >
                    Edit
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editingCharacter && (
        <CharacterEditModal
          key={editingCharacter.id}
          manhwa={manhwa}
          character={editingCharacter}
          crop={findCharacterCrop(crops, editingCharacter.id)}
          onClose={() => setEditingCharacterId(null)}
          onSaveCrop={(crop) => {
            upsertCharacterCrop(crop)
            setEditingCharacterId(null)
          }}
          onRemoveCrop={() => {
            removeCharacterCrop(editingCharacter.id)
            setEditingCharacterId(null)
          }}
          onToggleGuess={(useForGuess) =>
            patchCharacterFlags([editingCharacter.id], useForGuess)
          }
        />
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
