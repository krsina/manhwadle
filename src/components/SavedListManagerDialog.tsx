import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Manhwa } from '../lib/anilist-types'
import { matchesCatalogQuery, sortCatalogByRank } from '../lib/catalogBrowse'
import { displayTitle } from '../lib/daily'
import {
  filterPoolByTaste,
  READER_TASTE_OPTIONS,
  type ReaderTaste,
} from '../lib/readerTaste'
import { savedListDraftIssue, savedListProgress } from '../lib/savedListDraft'
import {
  createSavedList,
  deleteSavedList,
  getSavedList,
  listSavedLists,
  renameSavedList,
  replaceSavedListEntries,
  SAVED_LIST_MAX_COUNT,
  SAVED_LIST_MAX_NAME_LENGTH,
  SAVED_LIST_MIN_ENTRIES,
  savedListErrorMessage,
  type SavedListSummary,
} from '../lib/savedListsApi'
import { CatalogTileBody } from './CatalogTileBody'
import { Dialog } from './Dialog'

const PAGE_SIZE = 24

interface SavedListManagerDialogProps {
  open: boolean
  onClose: () => void
  catalog: Manhwa[]
  onListsChange?: (lists: SavedListSummary[]) => void
}

function tasteLabel(taste: ReaderTaste): string {
  if (taste === 'action') return 'Action'
  return taste === 'romance' ? 'Romance' : 'Both'
}

function updatedLabel(updatedAt: string | null): string | null {
  if (!updatedAt) return null
  const parsed = new Date(updatedAt)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

export function SavedListManagerDialog({
  open,
  onClose,
  catalog,
  onListsChange,
}: SavedListManagerDialogProps) {
  const [lists, setLists] = useState<SavedListSummary[]>([])
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [lane, setLane] = useState<ReaderTaste>('both')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const catalogById = useMemo(
    () => new Map(catalog.map((manhwa) => [manhwa.id, manhwa])),
    [catalog],
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selected = useMemo(
    () => selectedIds.flatMap((id) => {
      const manhwa = catalogById.get(id)
      return manhwa ? [manhwa] : []
    }),
    [catalogById, selectedIds],
  )
  const ranked = useMemo(() => {
    const tasted = filterPoolByTaste(catalog, lane)
    const matched = deferredQuery.trim()
      ? tasted.filter((manhwa) => matchesCatalogQuery(manhwa, deferredQuery))
      : tasted
    return sortCatalogByRank(matched)
  }, [catalog, deferredQuery, lane])
  const visible = ranked.slice(0, visibleCount)

  const scrollToTop = useCallback(() => {
    const panel = headRef.current?.closest('.modal')
    if (panel && typeof panel.scrollTo === 'function') panel.scrollTo({ top: 0 })
  }, [])

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
    setConfirmDeleteId(null)
    void refreshLists()
  }, [open, refreshLists])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredQuery, lane, editingId])

  function leaveEditor() {
    setEditingId(undefined)
    setError(null)
    scrollToTop()
  }

  function beginCreate() {
    setEditingId(null)
    setName('')
    setSelectedIds([])
    setQuery('')
    setLane('both')
    setError(null)
    scrollToTop()
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
    setLane('both')
    scrollToTop()
  }

  function toggleTitle(manhwaId: number) {
    setSelectedIds((ids) =>
      ids.includes(manhwaId)
        ? ids.filter((id) => id !== manhwaId)
        : [...ids, manhwaId],
    )
  }

  async function save() {
    if (pending) return
    const issue = savedListDraftIssue({ name, entryCount: selectedIds.length })
    if (issue) {
      setError(issue.message)
      if (issue.field === 'name') nameRef.current?.focus()
      return
    }
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
    scrollToTop()
  }

  async function remove(list: SavedListSummary) {
    if (pending) return
    setPending(true)
    setError(null)
    const result = await deleteSavedList({ listId: list.id })
    if (!result.ok) setError(savedListErrorMessage(result.error))
    else await refreshLists()
    setConfirmDeleteId(null)
    setPending(false)
  }

  const editing = editingId !== undefined

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId="saved-list-manager-title"
      descriptionId="saved-list-manager-description"
      panelClassName="saved-list-dialog"
    >
      <div className="saved-list-bar is-top" ref={headRef}>
        {editing && (
          <button
            className="btn btn-ghost saved-list-back"
            type="button"
            onClick={leaveEditor}
          >
            <span aria-hidden="true">←</span> Back
          </button>
        )}
        <div className="saved-list-bar-copy">
          <p className="versus-kicker">Private to your account</p>
          <h2 id="saved-list-manager-title">
            {editing
              ? editingId === null ? 'New list' : 'Edit list'
              : 'Saved Versus lists'}
          </h2>
          <p id="saved-list-manager-description" className="versus-muted">
            {editing
              ? `Pick at least ${SAVED_LIST_MIN_ENTRIES} catalog titles. Only your lobby sees the pool, never the list.`
              : 'Curate catalog titles, then share a list with a Versus lobby.'}
          </p>
        </div>
        <button
          className="saved-list-x"
          type="button"
          aria-label="Close saved lists"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {!editing ? (
        <>
          {error && <p className="versus-error" role="alert">{error}</p>}
          <div className="saved-list-toolbar">
            <span className="versus-chip">
              {lists.length}/{SAVED_LIST_MAX_COUNT} lists
            </span>
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending || lists.length >= SAVED_LIST_MAX_COUNT}
              onClick={beginCreate}
            >
              New list
            </button>
          </div>
          {lists.length === 0 ? (
            <div className="saved-list-empty">
              <strong>No saved lists yet</strong>
              <p className="versus-muted">
                Build a list of at least {SAVED_LIST_MIN_ENTRIES} titles, then share
                it with a collaborative lobby.
              </p>
              <button className="btn btn-primary" type="button" onClick={beginCreate}>
                Create your first list
              </button>
            </div>
          ) : (
            <ul className="saved-list-index">
              {lists.map((list) => {
                const updated = updatedLabel(list.updatedAt)
                return (
                  <li className="saved-list-card" key={list.id}>
                    <div className="saved-list-card-copy">
                      <strong>{list.name}</strong>
                      <small>
                        {list.entryCount} title{list.entryCount === 1 ? '' : 's'}
                        {updated ? ` · updated ${updated}` : ''}
                      </small>
                    </div>
                    {confirmDeleteId === list.id ? (
                      <div className="versus-actions">
                        <span className="saved-list-confirm">Delete this list?</span>
                        <button
                          className="btn saved-list-danger"
                          type="button"
                          disabled={pending}
                          onClick={() => void remove(list)}
                        >
                          Delete
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="versus-actions">
                        <button
                          className="btn"
                          type="button"
                          disabled={pending}
                          onClick={() => void beginEdit(list)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmDeleteId(list.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <div className="saved-list-editor">
          <label className="versus-field">
            <span className="versus-label">List name</span>
            <input
              ref={nameRef}
              value={name}
              maxLength={SAVED_LIST_MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="Favorites"
            />
          </label>
          <div className="saved-list-selection">
            <div className="saved-list-toolbar">
              <strong>Selected titles</strong>
              <span className="versus-chip">
                {selectedIds.length} picked
              </span>
            </div>
            {selected.length === 0 ? (
              <p className="versus-muted">
                Pick covers below to build the list. {SAVED_LIST_MIN_ENTRIES} minimum,
                up to the whole catalog.
              </p>
            ) : (
              <div className="saved-list-chips">
                {selected.map((manhwa) => (
                  <button
                    className="saved-list-title-chip"
                    type="button"
                    key={manhwa.id}
                    onClick={() => toggleTitle(manhwa.id)}
                    aria-label={`Remove ${displayTitle(manhwa)}`}
                  >
                    {displayTitle(manhwa)} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="database-controls saved-list-browser">
            <label className="database-search-label" htmlFor="saved-list-search">
              Search titles
            </label>
            <input
              id="saved-list-search"
              className="database-search-input"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Title or alias"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className="database-taste-tabs"
              role="tablist"
              aria-label="Reading preference filter"
            >
              {READER_TASTE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={option.id === lane}
                  className={`database-taste-tab${option.id === lane ? ' is-active' : ''}`}
                  onClick={() => setLane(option.id)}
                >
                  {tasteLabel(option.id)}
                </button>
              ))}
            </div>
          </div>
          <p className="database-page-count" aria-live="polite">
            {catalog.length === 0
              ? 'Loading catalog…'
              : `${ranked.length.toLocaleString()} title${ranked.length === 1 ? '' : 's'}`}
          </p>
          {catalog.length > 0 && ranked.length === 0 && (
            <p className="versus-muted" role="status">
              No titles match that search in this preference.
            </p>
          )}
          {visible.length > 0 && (
            <ul className="database-grid saved-list-grid">
              {visible.map((manhwa) => {
                const picked = selectedSet.has(manhwa.id)
                return (
                  <li className="database-tile" key={manhwa.id}>
                    <button
                      type="button"
                      className={`database-tile-link saved-list-pick${picked ? ' is-picked' : ''}`}
                      aria-pressed={picked}
                      onClick={() => toggleTitle(manhwa.id)}
                    >
                      <CatalogTileBody manhwa={manhwa} />
                      <span className="saved-list-pick-flag" aria-hidden="true">
                        {picked ? 'Added' : 'Add'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {visibleCount < ranked.length && (
            <button
              className="btn saved-list-more"
              type="button"
              onClick={() =>
                setVisibleCount((count) => Math.min(count + PAGE_SIZE, ranked.length))
              }
            >
              Show more titles
            </button>
          )}
          <div className="saved-list-bar is-bottom">
            {error ? (
              <p className="versus-error" role="alert">{error}</p>
            ) : (
              <p className="versus-muted saved-list-progress">
                {savedListProgress(selectedIds.length)}
              </p>
            )}
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={() => void save()}
            >
              {pending ? 'Saving…' : 'Save list'}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
