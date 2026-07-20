import { useEffect, useMemo, useState } from 'react'
import {
  ARCHIVE_MODE_LANES,
  daysInUtcMonth,
  getArchiveCellStatus,
  hasTripleSolveStatuses,
  parseDateKeyParts,
  statusLabel,
  toDateKey,
  utcMonthStartWeekday,
  type ArchiveCellStatus,
} from '../lib/archive'
import { loadDevForcedDates } from '../lib/archiveDevFake'
import { getTodayKey } from '../lib/daily'
import { fetchArchiveDateKeys } from '../lib/dailyPuzzle'
import type { ReaderTaste } from '../lib/readerTaste'
import { withTastePrefix } from '../lib/readerTaste'
import { loadDayState } from '../lib/storage'
import {
  annotateWeekStreakStyles,
  dayPlayLevelFromStatuses,
  type CellStreakStyle,
  type DayPlayLevel,
} from '../lib/streak'
import { useOwnerDevAccess } from '../lib/useOwnerDevAccess'
import { ArchiveDevStreakPanel } from './ArchiveDevStreakPanel'
import { Dialog } from './Dialog'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface ArchiveCalendarModalProps {
  open: boolean
  taste: ReaderTaste
  selectedDateKey: string
  onSelectDate: (dateKey: string) => void
  onClose: () => void
}

interface CalendarCell {
  dateKey: string
  day: number
  modeStatuses: ArchiveCellStatus[]
  playLevel: DayPlayLevel
  streak: CellStreakStyle | null
  isToday: boolean
  isSelected: boolean
  isFuture: boolean
  hasPuzzle: boolean
  hasFirstTry: boolean
  hasTripleSolve: boolean
  hasDoubleSolve: boolean
}

export function ArchiveCalendarModal({
  open,
  taste,
  selectedDateKey,
  onSelectDate,
  onClose,
}: ArchiveCalendarModalProps) {
  const { ownerDev } = useOwnerDevAccess()
  const todayKey = getTodayKey()
  const todayParts = parseDateKeyParts(todayKey)!
  const [viewYear, setViewYear] = useState(todayParts.year)
  const [viewMonth, setViewMonth] = useState(todayParts.monthIndex)
  const [availableKeys, setAvailableKeys] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [devTick, setDevTick] = useState(0)

  const modeStorages = useMemo(
    () =>
      ARCHIVE_MODE_LANES.map((lane) => ({
        ...lane,
        storage: withTastePrefix(lane.storagePrefix, taste),
      })),
    [taste],
  )

  useEffect(() => {
    if (!open) return
    const selected = parseDateKeyParts(selectedDateKey)
    if (selected) {
      setViewYear(selected.year)
      setViewMonth(selected.monthIndex)
    }
  }, [open, selectedDateKey])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void fetchArchiveDateKeys(taste).then((keys) => {
      if (cancelled) return
      // Empty set = allow any past/today day (local FNV fallback when remote is unset).
      setAvailableKeys(keys.length > 0 ? new Set(keys) : null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, taste])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const cells = useMemo(() => {
    const totalDays = daysInUtcMonth(viewYear, viewMonth)
    const startWeekday = utcMonthStartWeekday(viewYear, viewMonth)
    const result: (CalendarCell | null)[] = []
    const forcedDates = ownerDev ? loadDevForcedDates(taste) : new Set<string>()

    for (let i = 0; i < startWeekday; i++) {
      result.push(null)
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateKey = toDateKey(viewYear, viewMonth, day)
      const isFuture = dateKey > todayKey
      const hasPuzzle =
        !isFuture &&
        (availableKeys == null ||
          availableKeys.has(dateKey) ||
          forcedDates.has(dateKey))
      const modeStatuses = modeStorages.map((lane) => {
        if (!hasPuzzle) return 'unavailable' as const
        const dayState = loadDayState(dateKey, lane.storage)
        return getArchiveCellStatus(true, dayState)
      })
      const playLevel = hasPuzzle
        ? dayPlayLevelFromStatuses(modeStatuses)
        : ('none' as const)

      result.push({
        dateKey,
        day,
        modeStatuses,
        playLevel,
        streak: null,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDateKey,
        isFuture,
        hasPuzzle,
        hasFirstTry:
          modeStatuses.includes('first-try') &&
          !modeStatuses.includes('double-solve'),
        hasTripleSolve:
          hasTripleSolveStatuses(modeStatuses) &&
          !modeStatuses.includes('double-solve'),
        hasDoubleSolve: modeStatuses.includes('double-solve'),
      })
    }

    const levels = result.map((cell) => (cell ? cell.playLevel : null))
    const streakStyles = annotateWeekStreakStyles(levels)
    return result.map((cell, index) =>
      cell ? { ...cell, streak: streakStyles[index] ?? null } : null,
    )
  }, [
    viewYear,
    viewMonth,
    todayKey,
    availableKeys,
    modeStorages,
    selectedDateKey,
    taste,
    devTick,
    ownerDev,
  ])

  const weeks = useMemo(() => {
    const rows: (CalendarCell | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7)
      while (rowCells.length < 7) rowCells.push(null)
      rows.push(rowCells)
    }
    return rows
  }, [cells])

  const canGoPrev = useMemo(() => {
    if (availableKeys == null) {
      return viewYear > todayParts.year - 3
    }
    if (availableKeys.size === 0) return false
    let earliest = todayKey
    for (const key of availableKeys) {
      if (key < earliest) earliest = key
    }
    const earliestParts = parseDateKeyParts(earliest)
    if (!earliestParts) return false
    return (
      viewYear > earliestParts.year ||
      (viewYear === earliestParts.year && viewMonth > earliestParts.monthIndex)
    )
  }, [availableKeys, todayKey, todayParts.year, viewYear, viewMonth])

  const canGoNext =
    viewYear < todayParts.year ||
    (viewYear === todayParts.year && viewMonth < todayParts.monthIndex)

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(viewYear, viewMonth + delta, 1))
    setViewYear(date.getUTCFullYear())
    setViewMonth(date.getUTCMonth())
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId="archive-title"
      descriptionId="archive-desc"
      backdropClassName="archive-backdrop"
      panelClassName="archive-modal"
      shellClassName={`archive-shell${ownerDev ? ' has-dev-panel' : ''}`}
    >
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>

          <p className="modal-kicker">Archive</p>
          <h2 id="archive-title" className="modal-title archive-modal-title">
            Pick a past day
          </h2>
          <p id="archive-desc" className="archive-note">
            Archive plays don't count towards stats. Streaks group days you finished any mode.
          </p>

          <div className="archive-month-nav">
            <button
              type="button"
              className="btn btn-ghost archive-nav-btn"
              disabled={!canGoPrev}
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <p className="archive-month-label">
              {MONTH_LABELS[viewMonth]} {viewYear}
            </p>
            <button
              type="button"
              className="btn btn-ghost archive-nav-btn"
              disabled={!canGoNext}
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {loading ? (
            <p className="archive-loading">Loading available days…</p>
          ) : (
            <div className="archive-calendar" role="grid" aria-label="Puzzle archive calendar">
              <div className="archive-weekdays" role="row">
                {WEEKDAYS.map((label) => (
                  <span key={label} className="archive-weekday" role="columnheader">
                    {label}
                  </span>
                ))}
              </div>
              <div className="archive-days" role="rowgroup">
                {weeks.map((week, weekIndex) => (
                  <div key={`week-${weekIndex}`} className="archive-week" role="row">
                    {week.map((cell, index) =>
                      cell ? (
                        <span
                          key={cell.dateKey}
                          className={[
                            'archive-day-slot',
                            cell.streak ? `is-streak-${cell.streak.level}` : '',
                            cell.streak ? `is-streak-${cell.streak.edge}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="presentation"
                        >
                          <button
                            type="button"
                            role="gridcell"
                            className={[
                              'archive-day',
                              cell.hasPuzzle ? 'is-playable' : 'is-unavailable',
                              cell.isToday ? 'is-today' : '',
                              cell.isSelected ? 'is-selected' : '',
                              cell.hasFirstTry ? 'is-first-try' : '',
                              cell.hasTripleSolve ? 'is-triple-solve' : '',
                              cell.hasDoubleSolve ? 'is-double-solve' : '',
                              cell.playLevel !== 'none' ? `is-play-${cell.playLevel}` : '',
                              cell.streak ? 'is-in-streak' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            disabled={!cell.hasPuzzle}
                            aria-label={archiveDayLabel(cell)}
                            aria-current={cell.isSelected ? 'date' : undefined}
                            onClick={() => {
                              onSelectDate(cell.dateKey)
                              onClose()
                            }}
                          >
                            {(cell.hasFirstTry ||
                              cell.hasTripleSolve ||
                              cell.hasDoubleSolve) &&
                              cell.streak && (
                              <span
                                className={`archive-day-emphasis${
                                  cell.hasDoubleSolve
                                    ? ''
                                    : ' is-green'
                                }`}
                                aria-hidden="true"
                              />
                            )}
                            <span className="archive-day-num">{cell.day}</span>
                            {cell.hasPuzzle && (
                              <span className="archive-day-dots" aria-hidden="true">
                                {cell.modeStatuses.map((status, i) => (
                                  <span
                                    key={ARCHIVE_MODE_LANES[i]!.id}
                                    className={`archive-day-dot is-${status}`}
                                  />
                                ))}
                              </span>
                            )}
                          </button>
                        </span>
                      ) : (
                        <span
                          key={`pad-${weekIndex}-${index}`}
                          className="archive-day-slot is-pad"
                          aria-hidden="true"
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ul className="archive-legend" aria-label="Calendar legend">
            <li>
              <span className="archive-legend-swatch is-available" /> Available
            </li>
            <li>
              <span className="archive-legend-swatch is-playing" /> In progress
            </li>
            <li>
              <span className="archive-legend-swatch is-won" /> Won
            </li>
            <li>
              <span className="archive-legend-swatch is-first-try" /> First try solve
            </li>
            <li>
              <span className="archive-legend-swatch is-triple-solve" /> All modes solved
            </li>
            <li>
              <span className="archive-legend-swatch is-double-solve" /> Double solve
            </li>
            <li>
              <span className="archive-legend-swatch is-lost" /> Lost
            </li>
            <li>
              <span className="archive-legend-ribbon is-any" /> Streak
            </li>
          </ul>

          {selectedDateKey !== todayKey && (
            <div className="archive-actions">
              <button
                type="button"
                className="btn btn-primary btn-cta"
                onClick={() => {
                  onSelectDate(todayKey)
                  onClose()
                }}
              >
                Back to today
              </button>
            </div>
          )}
        {ownerDev && (
          <ArchiveDevStreakPanel
            taste={taste}
            viewYear={viewYear}
            viewMonth={viewMonth}
            todayKey={todayKey}
            seedDateKey={selectedDateKey}
            onChanged={() => setDevTick((n) => n + 1)}
          />
        )}
    </Dialog>
  )
}

function archiveDayLabel(cell: CalendarCell): string {
  const today = cell.isToday ? ', today' : ''
  if (!cell.hasPuzzle) return `${cell.dateKey}${today}, unavailable`
  const modes = ARCHIVE_MODE_LANES.map(
    (lane, i) => `${lane.label} ${statusLabel(cell.modeStatuses[i]!)}`,
  ).join(', ')
  const play =
    cell.hasTripleSolve
      ? ', all modes solved'
      : cell.streak
        ? ', streak'
        : cell.playLevel === 'all'
          ? ', all modes finished'
          : cell.playLevel === 'any'
            ? ', played'
            : ''
  return `${cell.dateKey}${today}${play}, ${modes}`
}

export function ArchiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="howto-btn archive-toggle"
      onClick={onClick}
      aria-label="Open puzzle archive"
      title="Archive"
    >
      <CalendarIcon />
    </button>
  )
}

function CalendarIcon() {
  return (
    <svg className="archive-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="15"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8 3.5v4M16 3.5v4M3.5 10.5h17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
