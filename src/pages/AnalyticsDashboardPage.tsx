import { useEffect, useMemo, useState } from 'react'
import {
  fetchOwnerAnalytics,
  percent,
  type AnalyticsMode,
  type AnalyticsSeriesRow,
  type OwnerAnalytics,
} from '../lib/analyticsApi'
import type { ReaderTaste } from '../lib/readerTaste'

type Preset = 'today' | '7d' | '30d'

function utcDate(daysAgo = 0): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function sum(rows: AnalyticsSeriesRow[], key: keyof AnalyticsSeriesRow): number {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`
}

function metricHelp(label: string): string {
  const help: Record<string, string> = {
    'Completion rate': 'Terminal plays divided by started plays.',
    'Solve rate': 'Wins divided by terminal plays.',
    'First-try rate': 'One-guess wins divided by all wins.',
    'Double-solve rate': 'Correct bonus names divided by first-try wins.',
  }
  return help[label] ?? ''
}

export function AnalyticsDashboardPage() {
  const [preset, setPreset] = useState<Preset>('30d')
  const [startDate, setStartDate] = useState(() => utcDate(29))
  const [endDate, setEndDate] = useState(() => utcDate())
  const [mode, setMode] = useState<AnalyticsMode | 'all'>('all')
  const [taste, setTaste] = useState<ReaderTaste | 'all'>('all')
  const [analytics, setAnalytics] = useState<OwnerAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void fetchOwnerAnalytics(
      {
        startDate,
        endDate,
        mode: mode === 'all' ? null : mode,
        taste: taste === 'all' ? null : taste,
      },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAnalytics(result.analytics)
    })
    return () => controller.abort()
  }, [startDate, endDate, mode, taste])

  const series = analytics?.series
  const rows = series ?? []
  const totals = useMemo(() => {
    const source = series ?? []
    const starts = sum(source, 'starts')
    const completions = sum(source, 'completions')
    const wins = sum(source, 'wins')
    const firstTries = sum(source, 'first_tries')
    const doubleSolves = sum(source, 'double_solves')
    const guessCountTotal = sum(source, 'guess_count_total')
    const hintsUsedTotal = sum(source, 'hints_used_total')
    const hardModePlays = sum(source, 'hard_mode_plays')
    const guessDistribution = [0, 1, 2, 3, 4, 5].map((index) =>
      source.reduce((total, row) => total + (row.guess_distribution[index] ?? 0), 0),
    )
    return {
      starts,
      completions,
      wins,
      firstTries,
      doubleSolves,
      guessCountTotal,
      hintsUsedTotal,
      hardModePlays,
      guessDistribution,
    }
  }, [series])

  const daily = useMemo(() => {
    const source = series ?? []
    const buckets = new Map<string, { starts: number; completions: number; wins: number }>()
    for (const row of source) {
      const bucket = buckets.get(row.date_key) ?? { starts: 0, completions: 0, wins: 0 }
      bucket.starts += row.starts
      bucket.completions += row.completions
      bucket.wins += row.wins
      buckets.set(row.date_key, bucket)
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [series])
  const maxDailyStarts = Math.max(1, ...daily.map(([, value]) => value.starts))

  function setRange(next: Preset) {
    setPreset(next)
    const days = next === 'today' ? 0 : next === '7d' ? 6 : 29
    setStartDate(utcDate(days))
    setEndDate(utcDate())
  }

  function exportCsv() {
    const header =
      'date,mode,taste,starts,completions,wins,first_tries,double_solves,active_users'
    const lines = rows.map((row) =>
      [
        row.date_key,
        row.mode,
        row.taste,
        row.starts,
        row.completions,
        row.wins,
        row.first_tries,
        row.double_solves,
        row.active_users,
      ].join(','),
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `manhwadle-analytics-${startDate}-${endDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const cards = [
    ['Total mode plays', totals.starts.toLocaleString()],
    ['Completed plays', totals.completions.toLocaleString()],
    ['Signed-in active users', (analytics?.signedActiveUsers ?? 0).toLocaleString()],
    ['New accounts', (analytics?.newAccounts ?? 0).toLocaleString()],
    [
      'Avg modes / player-day',
      analytics?.signedPlayerDays
        ? (analytics.signedStarts / analytics.signedPlayerDays).toFixed(2)
        : '0.00',
    ],
    ['Completion rate', formatRate(percent(totals.completions, totals.starts))],
    ['Solve rate', formatRate(percent(totals.wins, totals.completions))],
    ['First-try rate', formatRate(percent(totals.firstTries, totals.wins))],
    ['Double-solve rate', formatRate(percent(totals.doubleSolves, totals.firstTries))],
    [
      'Avg guesses / completion',
      totals.completions ? (totals.guessCountTotal / totals.completions).toFixed(2) : '0.00',
    ],
    [
      'Avg hints / completion',
      totals.completions ? (totals.hintsUsedTotal / totals.completions).toFixed(2) : '0.00',
    ],
    ['Hard mode usage', formatRate(percent(totals.hardModePlays, totals.completions))],
    [
      'All-four completion',
      formatRate(
        percent(analytics?.allModesPlayerDays ?? 0, analytics?.signedPlayerDays ?? 0),
      ),
    ],
  ] as const

  return (
    <section className="analytics-panel" aria-labelledby="analytics-title">
      <div className="analytics-heading">
        <div>
          <p className="modal-kicker">Owner only</p>
          <h2 id="analytics-title">Gameplay analytics</h2>
          <p className="analytics-quality-note">
            Signed-in server-verified play metrics only. Guest play is not tracked.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </button>
      </div>

      <div className="analytics-filters" aria-label="Analytics filters">
        <div className="analytics-presets">
          {(['today', '7d', '30d'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn btn-ghost${preset === value ? ' is-active' : ''}`}
              onClick={() => setRange(value)}
            >
              {value === 'today' ? 'Today' : value === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
        <label>
          Start
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => {
              setPreset('30d')
              setStartDate(event.target.value)
            }}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={utcDate()}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as AnalyticsMode | 'all')}
          >
            <option value="all">All modes</option>
            <option value="summary">Summary</option>
            <option value="character">Character</option>
            <option value="cover">Cover</option>
            <option value="heardle">Heardle</option>
          </select>
        </label>
        <label>
          Taste
          <select
            value={taste}
            onChange={(event) => setTaste(event.target.value as ReaderTaste | 'all')}
          >
            <option value="all">All tastes</option>
            <option value="action">Action</option>
            <option value="romance">Romance</option>
            <option value="both">Both</option>
          </select>
        </label>
      </div>

      {loading && <p role="status">Loading analytics…</p>}
      {error && (
        <p className="auth-modal-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <div className="analytics-cards">
            {cards.map(([label, value]) => (
              <article key={label} className="analytics-card" title={metricHelp(label)}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <section className="analytics-chart" aria-labelledby="plays-trend-title">
            <h3 id="plays-trend-title">Daily play trend</h3>
            {daily.length === 0 ? (
              <p>No analytics data for this range.</p>
            ) : (
              <div className="analytics-bars">
                {daily.map(([date, value]) => (
                  <div key={date} className="analytics-bar-column">
                    <span className="analytics-bar-value">{value.starts}</span>
                    <span
                      className="analytics-bar"
                      style={{ height: `${Math.max(4, (value.starts / maxDailyStarts) * 120)}px` }}
                      title={`${date}: ${value.starts} starts, ${value.completions} completed`}
                    />
                    <span>{date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="analytics-table-wrap" aria-labelledby="breakdown-title">
            <h3 id="breakdown-title">Mode and puzzle breakdown</h3>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Taste</th>
                  <th>Starts</th>
                  <th>Complete</th>
                  <th>Solve %</th>
                  <th>First try</th>
                  <th>Double</th>
                  <th>Players</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.date_key}:${row.mode}:${row.taste}`}>
                    <td>{row.date_key}</td>
                    <td>{row.mode}</td>
                    <td>{row.taste}</td>
                    <td>{row.starts}</td>
                    <td>{row.completions}</td>
                    <td>{formatRate(percent(row.wins, row.completions))}</td>
                    <td>{row.first_tries}</td>
                    <td>{row.double_solves}</td>
                    <td>{row.active_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="analytics-chart" aria-labelledby="guess-distribution-title">
            <h3 id="guess-distribution-title">Winning guess distribution</h3>
            <div className="analytics-guess-grid">
              {totals.guessDistribution.map((count, index) => (
                <div key={index + 1}>
                  <span>{index + 1} guesses</span>
                  <span
                    className="analytics-guess-track"
                    title={`${count} wins in ${index + 1} guesses`}
                  >
                    <span
                      style={{
                        width: `${percent(count, Math.max(1, ...totals.guessDistribution))}%`,
                      }}
                    />
                  </span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
