import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Manhwa } from '../lib/anilist-types'
import { searchManhwa, type SearchHit } from '../lib/search'

interface GuessInputProps {
  pool: Manhwa[]
  disabled: boolean
  excludedIds: Set<number>
  onGuess: (manhwa: Manhwa) => void
}

export function GuessInput({ pool, disabled, excludedIds, onGuess }: GuessInputProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      setOpen(false)
      return
    }

    const handle = window.setTimeout(() => {
      const next = searchManhwa(pool, query, 10).filter((h) => !excludedIds.has(h.manhwa.id))
      setHits(next)
      setOpen(next.length > 0)
      setActiveIndex(0)
    }, 120)

    return () => window.clearTimeout(handle)
  }, [query, pool, excludedIds])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function selectHit(hit: SearchHit) {
    onGuess(hit.manhwa)
    setQuery('')
    setHits([])
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === 'Enter') e.preventDefault()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length)
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
        placeholder={disabled ? 'Come back tomorrow' : 'Type a manhwa title…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[activeIndex] ? `${listId}-${hits[activeIndex].manhwa.id}` : undefined}
      />
      {open && (
        <ul id={listId} className="guess-list" role="listbox">
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
                <span className="guess-option-title">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
