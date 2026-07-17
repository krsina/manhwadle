import { useEffect, useMemo, useState } from 'react'
import { ARCHIVE_MODE_LANES, toDateKey } from '../lib/archive'
import {
  applyFakeDayOutcomes,
  clearFakeDay,
  FAKE_MODE_OUTCOMES,
  type ArchiveModeId,
  type FakeModeOutcome,
} from '../lib/archiveDevFake'
import type { ReaderTaste } from '../lib/readerTaste'
import { shiftUtcDateKey } from '../lib/streak'

interface ArchiveDevStreakPanelProps {
  taste: ReaderTaste
  viewYear: number
  viewMonth: number
  todayKey: string
  seedDateKey: string
  onChanged: () => void
}

const DEFAULT_OUTCOMES: Record<ArchiveModeId, FakeModeOutcome> = {
  summary: 'won',
  character: 'won',
  cover: 'won',
  heardle: 'won',
}

export function ArchiveDevStreakPanel({
  taste,
  viewYear,
  viewMonth,
  todayKey,
  seedDateKey,
  onChanged,
}: ArchiveDevStreakPanelProps) {
  const [dateKey, setDateKey] = useState(seedDateKey)
  const [outcomes, setOutcomes] =
    useState<Record<ArchiveModeId, FakeModeOutcome>>(DEFAULT_OUTCOMES)

  useEffect(() => {
    setDateKey(seedDateKey)
  }, [seedDateKey])

  const monthHint = useMemo(
    () => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`,
    [viewYear, viewMonth],
  )

  function setMode(modeId: ArchiveModeId, outcome: FakeModeOutcome) {
    setOutcomes((prev) => ({ ...prev, [modeId]: outcome }))
  }

  function applyDay() {
    applyFakeDayOutcomes(dateKey, taste, outcomes)
    onChanged()
  }

  function clearDay() {
    clearFakeDay(dateKey, taste)
    onChanged()
  }

  function paintRange(
    startKey: string,
    days: number,
    perDay: Record<ArchiveModeId, FakeModeOutcome>,
  ) {
    for (let i = 0; i < days; i++) {
      const key = shiftUtcDateKey(startKey, i)
      if (key > todayKey) break
      applyFakeDayOutcomes(key, taste, perDay)
    }
    onChanged()
  }

  function presetAnyStreak() {
    const start = shiftUtcDateKey(todayKey, -2)
    paintRange(start, 3, {
      summary: 'won',
      character: 'available',
      cover: 'available',
      heardle: 'available',
    })
    setDateKey(todayKey)
  }

  function presetAllStreak() {
    const start = shiftUtcDateKey(todayKey, -2)
    paintRange(start, 3, {
      summary: 'won',
      character: 'won',
      cover: 'won',
      heardle: 'won',
    })
    setDateKey(todayKey)
  }

  function presetAnyWithDouble() {
    const start = shiftUtcDateKey(todayKey, -2)
    applyFakeDayOutcomes(start, taste, {
      summary: 'won',
      character: 'lost',
      cover: 'available',
      heardle: 'available',
    })
    applyFakeDayOutcomes(shiftUtcDateKey(start, 1), taste, {
      summary: 'won',
      character: 'won',
      cover: 'available',
      heardle: 'lost',
    })
    applyFakeDayOutcomes(shiftUtcDateKey(start, 2), taste, {
      summary: 'double-solve',
      character: 'lost',
      cover: 'lost',
      heardle: 'won',
    })
    setDateKey(shiftUtcDateKey(start, 2))
    onChanged()
  }

  function presetClearRecent() {
    for (let i = 0; i < 7; i++) {
      clearFakeDay(shiftUtcDateKey(todayKey, -i), taste)
    }
    onChanged()
  }

  function useViewMid() {
    setDateKey(toDateKey(viewYear, viewMonth, 15))
  }

  return (
    <aside
      className="archive-dev-panel"
      aria-label="Dev streak fakes"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="archive-dev-kicker">Dev only</p>
      <h3 className="archive-dev-title">Fake calendar days</h3>
      <p className="archive-dev-note">
        Writes local day progress for <strong>{taste}</strong>. Viewing {monthHint}.
      </p>

      <label className="archive-dev-field">
        <span>Date</span>
        <input
          type="date"
          className="archive-dev-input"
          value={dateKey}
          max={todayKey}
          onChange={(e) => setDateKey(e.target.value)}
        />
      </label>

      <div className="archive-dev-quick">
        <button type="button" className="btn btn-ghost" onClick={() => setDateKey(todayKey)}>
          Today
        </button>
        <button type="button" className="btn btn-ghost" onClick={useViewMid}>
          Mid month
        </button>
      </div>

      <div className="archive-dev-modes">
        {ARCHIVE_MODE_LANES.map((lane) => (
          <label key={lane.id} className="archive-dev-field">
            <span>{lane.label}</span>
            <select
              className="archive-dev-input"
              value={outcomes[lane.id]}
              onChange={(e) => setMode(lane.id, e.target.value as FakeModeOutcome)}
            >
              {FAKE_MODE_OUTCOMES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="archive-dev-actions">
        <button type="button" className="btn btn-primary" onClick={applyDay}>
          Apply day
        </button>
        <button type="button" className="btn btn-ghost" onClick={clearDay}>
          Clear day
        </button>
      </div>

      <p className="archive-dev-presets-label">Presets (ending today)</p>
      <div className="archive-dev-presets">
        <button type="button" className="btn btn-ghost" onClick={presetAnyStreak}>
          Streak ×3
        </button>
        <button type="button" className="btn btn-ghost" onClick={presetAllStreak}>
          All ×3
        </button>
        <button type="button" className="btn btn-ghost" onClick={presetAnyWithDouble}>
          Any + double
        </button>
        <button type="button" className="btn btn-ghost" onClick={presetClearRecent}>
          Clear last 7
        </button>
      </div>
    </aside>
  )
}
