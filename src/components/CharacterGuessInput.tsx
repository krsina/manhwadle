import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ManhwaCharacter } from '../lib/anilist-types'
import {
  CHARACTER_SEARCH_LIMIT,
  searchCharacters,
  type CharacterSearchHit,
} from '../lib/search'

interface CharacterGuessInputProps {
  characters: ManhwaCharacter[]
  disabled?: boolean
  placeholder?: string
  onGuess: (character: ManhwaCharacter, matchedLabel?: string) => void
}

/** Autocomplete picker for character names — same interaction model as manhwa GuessInput. */
export function CharacterGuessInput({
  characters,
  disabled = false,
  placeholder = 'Type a character name…',
  onGuess,
}: CharacterGuessInputProps) {
  const listId = useId()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CharacterSearchHit[]>([])
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

    // Cast search is cheap; run immediately so typing feels instant.
    const next = searchCharacters(characters, query, CHARACTER_SEARCH_LIMIT)
    setHits(next)
    setNoResults(next.length === 0)
    setOpen(true)
    setActiveIndex(0)
  }, [query, characters, disabled])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (!open || !listRef.current) return
    const active = listRef.current.querySelector<HTMLElement>('[aria-selected="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, hits])

  useEffect(() => {
    if (!open || disabled || !rootRef.current) return
    // Keep the bonus guess field and suggestion list above the mobile keyboard.
    const id = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, disabled])

  function selectHit(hit: CharacterSearchHit) {
    if (disabled) return
    onGuess(hit.character, hit.label)
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
    <div className="guess character-guess" ref={rootRef}>
      <label className="guess-label" htmlFor={inputId}>
        Character name
      </label>
      <input
        id={inputId}
        className="guess-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (disabled) return
          if (hits.length > 0) setOpen(true)
          window.requestAnimationFrame(() => {
            rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && hits[activeIndex]
            ? `${listId}-opt-${activeIndex}`
            : undefined
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
            No matching characters
          </div>
        ) : (
        <ul id={listId} className="guess-list" role="listbox" ref={listRef}>
          {hits.map((hit, index) => (
            <li key={`${hit.character.id}-${index}`} role="presentation">
              <button
                type="button"
                id={`${listId}-opt-${index}`}
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
        )
      )}
    </div>
  )
}
