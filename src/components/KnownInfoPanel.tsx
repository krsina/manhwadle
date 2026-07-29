import { useState, type ReactNode } from 'react'
import { useMatchMedia } from '../hooks/useMatchMedia'
import type { KnownInfo } from '../lib/knowledge'

interface KnownInfoPanelProps {
  info: KnownInfo
  hasGuesses: boolean
}

/** Below desktop side-rail breakpoint — collapse Known / Ruled out into summary bars. */
const DESKTOP_RAIL_MQ = '(min-width: 960px)'

function genreToneClass(state: KnownInfo['genres']['state']): string {
  switch (state) {
    case 'exact':
      return 'tone-correct'
    case 'partial':
      return 'tone-close'
    case 'wrong':
      return 'tone-incorrect'
    default:
      return 'tone-incorrect'
  }
}

function genreKnownValue(info: KnownInfo['genres']): string {
  if (info.state === 'exact') {
    return info.confirmed.length > 0 ? info.confirmed.join(', ') : '—'
  }
  if (info.state === 'partial') {
    return info.confirmed.length > 0 ? info.confirmed.join(', ') : 'Partial'
  }
  if (info.state === 'wrong') return 'None yet'
  return '—'
}

function yearKnownValue(info: KnownInfo['year']): string {
  if (info.exact != null) return String(info.exact)

  const clues: { year: number; label: string }[] = []
  if (info.minExclusive != null) {
    clues.push({ year: info.minExclusive, label: `${info.minExclusive} ↑` })
  }
  if (info.maxExclusive != null) {
    clues.push({ year: info.maxExclusive, label: `${info.maxExclusive} ↓` })
  }

  if (clues.length === 0) return '—'
  clues.sort((a, b) => a.year - b.year)
  return clues.map((c) => c.label).join(' · ')
}

function yearToneClass(info: KnownInfo['year']): string {
  if (info.exact != null) return 'tone-correct'
  if (info.minExclusive != null || info.maxExclusive != null) return 'tone-close'
  return 'tone-incorrect'
}

function statusToneClass(info: KnownInfo['status']): string {
  if (info.known) return 'tone-correct'
  return 'tone-incorrect'
}

function publisherToneClass(info: KnownInfo['publisher']): string {
  if (info.known) return 'tone-correct'
  return 'tone-incorrect'
}

function ChipList({
  items,
  variant,
  empty,
}: {
  items: string[]
  variant: 'shared' | 'muted'
  empty: string
}) {
  if (items.length === 0) {
    return <span className="rail-empty">{empty}</span>
  }

  return (
    <ul className="tag-chips">
      {items.map((item) => (
        <li
          key={item}
          className={`tag-chip${variant === 'shared' ? ' is-shared' : ' is-muted'}`}
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

function knownSummary(info: KnownInfo): string {
  const parts: string[] = []
  if (info.genres.confirmed.length > 0) {
    parts.push(info.genres.confirmed.slice(0, 2).join(', '))
  } else if (info.genres.state === 'partial') {
    parts.push('Partial genres')
  }
  const year = yearKnownValue(info.year)
  if (year !== '—') parts.push(year)
  if (info.status.known) parts.push(info.status.known)
  if (info.publisher.known) parts.push(info.publisher.known)
  if (info.tags.confirmed.length > 0) {
    parts.push(
      info.tags.confirmed.length === 1
        ? info.tags.confirmed[0]
        : `${info.tags.confirmed.length} tags`,
    )
  }
  return parts.length > 0 ? parts.join(' · ') : 'No clues yet'
}

function ruledOutSummary(info: KnownInfo): string {
  const parts: string[] = []
  if (info.genres.ruledOut.length > 0) {
    parts.push(`${info.genres.ruledOut.length} genres`)
  }
  if (info.status.ruledOut.length > 0) {
    parts.push(`${info.status.ruledOut.length} status`)
  }
  if (info.publisher.ruledOut.length > 0) {
    parts.push(`${info.publisher.ruledOut.length} publisher`)
  }
  if (info.tags.ruledOut.length > 0) {
    parts.push(`${info.tags.ruledOut.length} tags`)
  }
  return parts.join(' · ')
}

function CollapsibleBlock({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={`known-block${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="known-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="known-toggle-text">
          <span className="known-heading">{title}</span>
          <span className="known-summary">{summary}</span>
        </span>
        <span className="known-toggle-chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div className="known-block-body">{children}</div> : null}
    </div>
  )
}

function KnownStack({ info }: { info: KnownInfo }) {
  return (
    <div className="rail-stack">
      <div className={`rail-item ${genreToneClass(info.genres.state)}`}>
        <span className="rail-label">Genres</span>
        <span className="rail-value">{genreKnownValue(info.genres)}</span>
      </div>
      <div className={`rail-item ${yearToneClass(info.year)}`}>
        <span className="rail-label">Year</span>
        <span className="rail-value">{yearKnownValue(info.year)}</span>
      </div>
      <div className={`rail-item ${statusToneClass(info.status)}`}>
        <span className="rail-label">Status</span>
        <span className="rail-value">{info.status.known ?? '—'}</span>
      </div>
      <div className={`rail-item ${publisherToneClass(info.publisher)}`}>
        <span className="rail-label">Publisher</span>
        <span className="rail-value">{info.publisher.known ?? '—'}</span>
      </div>
      <div className="rail-item rail-item-tags">
        <span className="rail-label">Tags</span>
        <ChipList items={info.tags.confirmed} variant="shared" empty="—" />
      </div>
    </div>
  )
}

function RuledOutStack({ info }: { info: KnownInfo }) {
  return (
    <div className="rail-stack">
      <div className="rail-item tone-incorrect">
        <span className="rail-label">Genres</span>
        <span className="rail-value">
          {info.genres.ruledOut.length > 0 ? info.genres.ruledOut.join(', ') : '—'}
        </span>
      </div>
      <div className="rail-item tone-incorrect">
        <span className="rail-label">Status</span>
        <span className="rail-value">
          {info.status.ruledOut.length > 0 ? info.status.ruledOut.join(', ') : '—'}
        </span>
      </div>
      <div className="rail-item tone-incorrect">
        <span className="rail-label">Publisher</span>
        <span className="rail-value">
          {info.publisher.ruledOut.length > 0 ? info.publisher.ruledOut.join(', ') : '—'}
        </span>
      </div>
      <div className="rail-item rail-item-tags">
        <span className="rail-label">Tags</span>
        <ChipList items={info.tags.ruledOut} variant="muted" empty="—" />
      </div>
    </div>
  )
}

export function KnownInfoPanel({ info, hasGuesses }: KnownInfoPanelProps) {
  const isDesktopRail = useMatchMedia(DESKTOP_RAIL_MQ)
  const [knownOpen, setKnownOpen] = useState(false)
  const [ruledOpen, setRuledOpen] = useState(false)

  if (!hasGuesses) {
    return (
      <section className="known" aria-label="Known information">
        <p className="known-empty">Guess to fill in what you know.</p>
      </section>
    )
  }

  const hasRuledOut =
    info.genres.ruledOut.length > 0 ||
    info.status.ruledOut.length > 0 ||
    info.publisher.ruledOut.length > 0 ||
    info.tags.ruledOut.length > 0

  if (isDesktopRail) {
    return (
      <section className="known" aria-label="Known information">
        <div className="known-block">
          <p className="known-heading">Known</p>
          <KnownStack info={info} />
        </div>

        {hasRuledOut && (
          <div className="known-block">
            <p className="known-heading">Ruled out</p>
            <RuledOutStack info={info} />
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="known known-compact" aria-label="Known information">
      <CollapsibleBlock
        title="Known"
        summary={knownSummary(info)}
        open={knownOpen}
        onToggle={() => setKnownOpen((v) => !v)}
      >
        <KnownStack info={info} />
      </CollapsibleBlock>

      {hasRuledOut && (
        <CollapsibleBlock
          title="Ruled out"
          summary={ruledOutSummary(info)}
          open={ruledOpen}
          onToggle={() => setRuledOpen((v) => !v)}
        >
          <RuledOutStack info={info} />
        </CollapsibleBlock>
      )}
    </section>
  )
}
