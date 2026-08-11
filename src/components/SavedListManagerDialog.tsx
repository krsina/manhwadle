import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Manhwa } from '../lib/anilist-types'
import { displayTitle } from '../lib/daily'
import {
  createSavedList,
  deleteSavedList,
  getSavedList,
  listSavedLists,
  renameSavedList,
  replaceSavedListEntries,
  SAVED_LIST_MAX_COUNT,
  SAVED_LIST_MAX_ENTRIES,
  SAVED_LIST_MAX_NAME_LENGTH,
  SAVED_LIST_MIN_ENTRIES,
  savedListErrorMessage,
  type SavedListSummary,
} from '../lib/savedListsApi'
import { MANHWA_SEARCH_LIMIT, searchManhwa } from '../lib/search'
import { Dialog } from './Dialog'

interface SavedListManagerDialogProps {
  open: boolean
  onClose: () => void
  catalog: Manhwa[]
  onListsChange?: (lists: SavedListSummary[]) => void
}

export function SavedListManagerDialog({
  open,
  onClose,
  catalog,
  onListsChange,
}: SavedListManagerDialogProps) {
  const [lists, setLists] = useState<SavedListSummary[]>([])
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const catalogById = useMemo(
    () => new Map(catalog.map((manhwa) => [manhwa.id, manhwa])),
    [catalog],
  )
  const selected = useMemo(
    () => selectedIds.flatMap((id) => {
      const manhwa = catalogById.get(id)
      return manhwa ? [manhwa] : []
    }),
    [catalogById, selectedIds],
  )
  const hits = useMemo(() => {
    if (!query.trim()) return []
    const selectedSet = new Set(selectedIds)
    return searchManhwa(catalog, query, MANHWA_SEARCH_LIMIT).filter(
      (hit) => !selectedSet.has(hit.manhwa.id),
    )
  }, [catalog, query, selectedIds])

  const refreshLists = useCallback(async () => {
    const result = await listSavedLists()
    if (!result.ok) {
      setError(savedListErrorMessage(result.error))
      return
    }
    setLists(result.value)
    onListsChange?.(result.value)
  }, [onListsChange])

  useEffect(() => {
    if (!open) return
    setError(null)
    setEditingId(undefined)
    void refreshLists()
  }, [open, refreshLists])

  function beginCreate() {
    setEditingId(null)
    setName('')
    setSelectedIds([])
    setQuery('')
    setError(null)
  }

  async function beginEdit(list: SavedListSummary) {
    setPending(true)
    setError(null)
    const result = await getSavedList(list.id)
    setPending(false)
    if (!result.ok) {
      setError(savedListErrorMessage(result.error))
      return
    }
    setEditingId(list.id)
    setName(result.value.name)
    setSelectedIds(result.value.manhwaIds)
    setQuery('')
  }

  async function save() {
    if (
      pending ||
      name.trim().length < 1 ||
      name.trim().length > SAVED_LIST_MAX_NAME_LENGTH ||
      selectedIds.length < SAVED_LIST_MIN_ENTRIES ||
      selectedIds.length > SAVED_LIST_MAX_ENTRIES
    ) return
    setPending(true)
    setError(null)
    if (editingId === null) {
      const created = await createSavedList({
        name,
        manhwaIds: selectedIds,
      })
      if (!created.ok) {
        setPending(false)
        setError(savedListErrorMessage(created.error))
        return
      }
    } else if (editingId) {
      const original = lists.find((list) => list.id === editingId)
      if (original?.name !== name.trim()) {
        const renamed = await renameSavedList({ listId: editingId, name })
        if (!renamed.ok) {
          setPending(false)
          setError(savedListErrorMessage(renamed.error))
          return
        }
      }
      const replaced = await replaceSavedListEntries({
        listId: editingId,
        manhwaIds: selectedIds,
      })
      if (!replaced.ok) {
        setPending(false)
        setError(savedListErrorMessage(replaced.error))
        return
      }
    }
    await refreshLists()
    setEditingId(undefined)
    setPending(false)
  }

  async function remove(list: SavedListSummary) {
    if (pending || !window.confirm(`Delete "${list.name}"?`)) return
    setPending(true)
    setError(null)
    const result = await deleteSavedList({ listId: list.id })
    if (!result.ok) setError(savedListErrorMessage(result.error))
    else await refreshLists()
    setPending(false)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId="saved-list-manager-title"
      descriptionId="saved-list-manager-description"
      panelClassName="saved-list-dialog"
    >
      <div className="saved-list-head">
        <div>
          <p className="versus-kicker">Private to your account</p>
          <h2 id="saved-list-manager-title">Saved Versus lists</h2>
          <p id="saved-list-manager-description" className="versus-muted">
            Curate catalog titles, then contribute a private snapshot to a lobby.
          </p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {error && <p className="versus-error" role="alert">{error}</p>}
      {editingId === undefined ? (
        <>
          <div className="saved-list-toolbar">
            <span className="versus-chip">{lists.length}/{SAVED_LIST_MAX_COUNT} lists</span>
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending || lists.length >= SAVED_LIST_MAX_COUNT}
              onClick={beginCreate}
            >
              New list
            </button>
          </div>
          <div className="saved-list-index">
            {lists.length === 0 ? (
              <p className="versus-muted">No lists yet. Create one with at least three titles.</p>
            ) : lists.map((list) => (
              <article className="saved-list-row" key={list.id}>
                <div>
                  <strong>{list.name}</strong>
                  <small>{list.entryCount} titles</small>
                </div>
                <div className="versus-actions">
                  <button className="btn" type="button" onClick={() => void beginEdit(list)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void remove(list)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="saved-list-editor">
          <label className="versus-field">
            <span className="versus-label">List name</span>
            <input
              value={name}
              maxLength={SAVED_LIST_MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="Favorites"
            />
          </label>
          <label className="versus-field">
            <span className="versus-label">Add catalog titles</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search manhwa…"
              autoComplete="off"
            />
          </label>
          {query.trim() && (
            <div className="saved-list-results" role="listbox">
              {hits.length === 0 ? (
                <p className="versus-muted">No matching available titles.</p>
              ) : hits.map((hit) => (
                <button
                  key={hit.manhwa.id}
                  className="saved-list-result"
                  type="button"
                  disabled={selectedIds.length >= SAVED_LIST_MAX_ENTRIES}
                  onClick={() => {
                    setSelectedIds((ids) => [...ids, hit.manhwa.id])
                    setQuery('')
                  }}
                >
                  <span>{hit.label}</span>
                  <small>Add</small>
                </button>
              ))}
            </div>
          )}
          <div className="saved-list-selected">
            <div className="saved-list-toolbar">
              <strong>Selected titles</strong>
              <span className="versus-chip">
                {selectedIds.length}/{SAVED_LIST_MAX_ENTRIES}
              </span>
            </div>
            {selected.length === 0 ? (
              <p className="versus-muted">Search above to add titles.</p>
            ) : (
              <div className="saved-list-chips">
                {selected.map((manhwa) => (
                  <button
                    className="saved-list-title-chip"
                    type="button"
                    key={manhwa.id}
                    onClick={() => setSelectedIds((ids) =>
                      ids.filter((id) => id !== manhwa.id)
                    )}
                    title="Remove title"
                  >
                    {displayTitle(manhwa)} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="versus-hint">
            Lists require {SAVED_LIST_MIN_ENTRIES}–{SAVED_LIST_MAX_ENTRIES} unique catalog titles.
          </p>
          <div className="versus-panel-foot">
            <button
              className="btn btn-primary"
              type="button"
              disabled={
                pending ||
                name.trim().length < 1 ||
                selectedIds.length < SAVED_LIST_MIN_ENTRIES
              }
              onClick={() => void save()}
            >
              {pending ? 'Saving…' : 'Save list'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditingId(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
