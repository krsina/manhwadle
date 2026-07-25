import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Manhwa } from '../lib/anilist-types'
import {
  highlightTitleMatches,
  MANHWA_SEARCH_LIMIT,
  searchManhwa,
  type SearchHit,
} from '../lib/search'

interface GuessInputProps {
  pool: Manhwa[]
  disabled: boolean
  excludedIds: Set<number>
  onGuess: (manhwa: Manhwa, matchedLabel?: string) => void
  /** Shown when disabled; defaults to “Come back tomorrow”. */
  disabledPlaceholder?: string
}

function HighlightedTitle({ label, query }: { label: string; query: string }): ReactNode {
  const segments = highlightTitleMatches(label, query)
  if (segments.length === 0) return label
  if (segments.length === 1 && !segments[0]?.matched) return label

  return segments.map((seg, index) =>
    seg.matched ? (
      <mark key={index} className="guess-match">
        {seg.text}
      </mark>
    ) : (
      <span key={index}>{seg.text}</span>
    ),
  )
}

export function GuessInput({
  pool,
  disabled,
  excludedIds,
  onGuess,
  disabledPlaceholder = 'Come back tomorrow',
}: GuessInputProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  function clearSuggestions() {
    setQuery('')
    setHits([])
    setOpen(false)
    setNoResults(false)
    setActiveIndex(0)
  }

  // After give-up / win / loss, drop any open suggestion list so clicks can't
  // fire a silent no-op "phantom" guess.
  useEffect(() => {
    if (disabled) clearSuggestions()
  }, [disabled])

  useEffect(() => {
    if (disabled) return
    if (!query.trim()) {
      setHits([])
      setOpen(false)
      setNoResults(false)
      return
    }

    // Catalog search is cheap (~1k titles); run immediately for snappier typing.
    const next = searchManhwa(pool, query, MANHWA_SEARCH_LIMIT).filter(
      (h) => !excludedIds.has(h.manhwa.id),
    )
    setHits(next)
    const empty = next.length === 0
    setNoResults(empty)
    setOpen(true)
    setActiveIndex(0)
  }, [query, pool, excludedIds, disabled])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Keep the highlighted option in view while arrowing through the list
  useEffect(() => {
    if (!open || !listRef.current) return
    const active = listRef.current.querySelector<HTMLElement>('[aria-selected="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, hits])

  function selectHit(hit: SearchHit) {
    if (disabled) return
    onGuess(hit.manhwa, hit.label)
    clearSuggestions()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (noResults && e.key === 'Enter') {
      e.preventDefault()
      return
    }
    if (!open || hits.length === 0) {
      if (e.key === 'Enter') e.preventDefault()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[activeIndex]
      if (hit) selectHit(hit)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="guess" ref={rootRef}>
      <label className="guess-label" htmlFor="guess-input">
        Your guess
      </label>
      <input
        id="guess-input"
        className="guess-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={disabled ? disabledPlaceholder : 'Type a manhwa title…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => !disabled && hits.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && hits[activeIndex] ? `${listId}-${hits[activeIndex].manhwa.id}` : undefined
        }
      />
      {open && !disabled && (
        noResults ? (
          <div
            id={listId}
            className="guess-list guess-empty"
            role="status"
            aria-live="polite"
          >
            No matching titles
          </div>
        ) : (
        <ul id={listId} className="guess-list" role="listbox" ref={listRef}>
          {hits.map((hit, index) => (
            <li key={hit.manhwa.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${hit.manhwa.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`guess-option${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectHit(hit)}
              >
                <span className="guess-option-title">
                  <HighlightedTitle label={hit.label} query={query} />
                </span>
                {hit.matchedAs ? (
                  <span className="guess-option-alias">{hit.matchedAs}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        )
      )}
    </div>
  )
}
