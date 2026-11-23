import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_WORKERS,
  OsuMigrationEngine,
  parseIdsText,
  type EngineSnapshot,
  type MapItem,
  type MapStatus,
} from '../lib/osuMigration'
import {
  clearDownloadsHistory,
  downloadsSink,
  pickFolderSink,
  supportsFolderPicker,
} from '../lib/osuMapSinks'
import { fetchPrivateFileText, saveBlob } from '../lib/privateFilesApi'

type Filter = 'remaining' | 'failed' | 'done' | 'all'
const ROW_LIMIT = 300

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`
  return `${n} B`
}

function statusLabel(it: MapItem): string {
  if (it.status === 'downloading') {
    const pct = it.size ? ` ${Math.floor((it.got / it.size) * 100)}%` : ''
    return `downloading${pct}`
  }
  if (it.status === 'done' && it.skipped) return 'already saved'
  return it.status
}

function matches(filter: Filter, status: MapStatus): boolean {
  if (filter === 'all') return true
  if (filter === 'done') return status === 'done'
  if (filter === 'failed') return status === 'failed'
  return status !== 'done' && status !== 'failed'
}

export function StaffOsuPage() {
  const canPickFolder = supportsFolderPicker()
  const engineRef = useRef<OsuMigrationEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new OsuMigrationEngine({ sink: downloadsSink() })
  }
  const engine = engineRef.current

  const [snap, setSnap] = useState<EngineSnapshot>(() => engine.snapshot())
  const [destination, setDestination] = useState<string | null>(
    canPickFolder ? null : 'your Downloads folder',
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [filter, setFilter] = useState<Filter>('remaining')
  const [notice, setNotice] = useState<string | null>(null)

  // Poll the engine; it mutates in place while downloads run.
  useEffect(() => {
    const t = setInterval(() => setSnap(engine.snapshot()), 500)
    return () => clearInterval(t)
  }, [engine])

  // Load the owner's ids.txt from the private-files function.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetchPrivateFileText('ids.txt')
      if (cancelled) return
      setLoading(false)
      if (!res.ok) {
        setLoadError(res.error)
        return
      }
      await engine.load(parseIdsText(res.value))
      setSnap(engine.snapshot())
    })()
    return () => {
      cancelled = true
    }
  }, [engine])

  // Warn before closing the tab mid-download; stop cleanly on navigation.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (engine.running) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      void engine.stop()
    }
  }, [engine])

  async function chooseFolder() {
    const sink = await pickFolderSink()
    if (!sink) return
    try {
      await engine.setSink(sink)
      setDestination(sink.label)
      setNotice(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not use that folder.')
    }
    setSnap(engine.snapshot())
  }

  async function addPasted() {
    const entries = parseIdsText(paste)
    const added = await engine.load(entries)
    setNotice(
      entries.length
        ? `Added ${added} new map${added === 1 ? '' : 's'}${entries.length > added ? ` (${entries.length - added} already listed)` : ''}.`
        : 'No beatmap IDs or links found.',
    )
    if (added) setPaste('')
    setSnap(engine.snapshot())
  }

  const visible = useMemo(
    () => snap.items.filter((it) => matches(filter, it.status)),
    [snap.items, filter],
  )

  const { counts } = snap
  const busy = snap.running
  const needsFolder = canPickFolder && !destination
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0

  return (
    <section className="staff-console-panel osu-migrate" aria-labelledby="osu-migrate-heading">
      <h2 id="osu-migrate-heading">osu! map migration</h2>
      <p>
        Downloads every beatmapset in your <code>ids.txt</code> from public mirrors
        (osu.direct, sayobot, nerinyan). Keep this tab open while it runs. Maps already
        in the folder are skipped, so stopping and coming back is safe.
      </p>

      {loading && <p role="status">Loading your ids.txt…</p>}
      {loadError && (
        <p className="osu-migrate-error" role="alert">
          Couldn't load ids.txt: {loadError} You can still paste IDs below.
        </p>
      )}

      <div className="osu-migrate-row">
        <strong>Save to:</strong>{' '}
        {destination ?? 'no folder chosen yet'}
        {canPickFolder ? (
          <button type="button" className="btn btn-ghost" onClick={() => void chooseFolder()} disabled={busy}>
            {destination ? 'Change folder' : 'Choose folder'}
          </button>
        ) : (
          <span className="osu-migrate-hint">
            This browser can't write to a folder, so each map is saved as a normal download.
            Chrome, Edge or Brave can save straight into a folder.
          </span>
        )}
      </div>

      <div className="osu-migrate-progress" aria-label={`${counts.done} of ${counts.total} done`}>
        <div className="osu-migrate-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="osu-migrate-stats" role="status" aria-live="polite">
        {counts.done} / {counts.total} done ({counts.skipped} already saved) · {counts.downloading} downloading ·{' '}
        {counts.waiting} waiting · {counts.queued} queued · {counts.failed} failed
        {busy && ` · ${formatBytes(snap.bytesPerSecond)}/s`}
        {snap.paused && ' · paused'}
        {snap.stopping && ' · stopping…'}
      </p>

      <div className="osu-migrate-row">
        {!busy && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={needsFolder || counts.queued === 0}
            title={needsFolder ? 'Choose a folder first' : undefined}
            onClick={() => {
              engine.start()
              setSnap(engine.snapshot())
            }}
          >
            {counts.done > counts.skipped || snap.finished ? 'Continue' : 'Start'}
          </button>
        )}
        {busy && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={snap.stopping}
            onClick={() => engine.pause(!snap.paused)}
          >
            {snap.paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {busy && (
          <button type="button" className="btn btn-ghost" disabled={snap.stopping} onClick={() => void engine.stop()}>
            Stop
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={counts.failed === 0 || needsFolder}
          onClick={() => engine.retryFailed()}
        >
          Retry failed
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={counts.failed === 0}
          onClick={() =>
            saveBlob(new Blob([engine.failedList() + '\n'], { type: 'text/plain' }), 'failed.txt')
          }
        >
          Save failed.txt
        </button>
        <label className="osu-migrate-field">
          Parallel{' '}
          <select
            value={snap.workers}
            onChange={(e) => engine.setWorkers(Number(e.target.value))}
          >
            {Array.from({ length: MAX_WORKERS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="osu-migrate-field">
          <input
            type="checkbox"
            checked={snap.noVideo}
            onChange={(e) => engine.setNoVideo(e.target.checked)}
          />{' '}
          Skip videos
        </label>
      </div>

      <div className="osu-migrate-mirrors">
        {snap.mirrors.map((m) => (
          <div key={m.name} className="osu-migrate-mirror">
            <strong>{m.name}</strong>
            <span>
              {m.active}/{m.cap} active · {m.ok} ok · {m.fail} missed
            </span>
            <span className="osu-migrate-hint">
              {m.cooldownSeconds > 0 ? `resting ${m.cooldownSeconds}s` : m.last ? `last: ${m.last}` : 'idle'}
              {!m.noVideo && ' · always includes video'}
            </span>
          </div>
        ))}
      </div>

      {notice && <p role="status">{notice}</p>}

      <details className="osu-migrate-add">
        <summary>Add more maps</summary>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="One ID or https://osu.ppy.sh/beatmapsets/... link per line"
        />
        <button type="button" className="btn btn-ghost" onClick={() => void addPasted()} disabled={!paste.trim()}>
          Add to list
        </button>
      </details>

      <nav className="staff-nav" aria-label="Map list filter">
        {(['remaining', 'failed', 'done', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`btn btn-ghost${filter === f ? ' active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </nav>

      <div className="osu-migrate-table-wrap">
        <table className="osu-migrate-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Mirror / error</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, ROW_LIMIT).map((it) => (
              <tr key={it.id} data-status={it.status}>
                <td>
                  <a href={`https://osu.ppy.sh/beatmapsets/${it.id}`} target="_blank" rel="noopener noreferrer">
                    {it.id}
                  </a>
                </td>
                <td>{it.title || '—'}</td>
                <td>{statusLabel(it)}</td>
                <td>{it.status === 'failed' ? it.error : it.mirror}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > ROW_LIMIT && (
          <p className="osu-migrate-hint">Showing the first {ROW_LIMIT} of {visible.length}.</p>
        )}
        {visible.length === 0 && <p className="osu-migrate-hint">Nothing here.</p>}
      </div>

      <details className="osu-migrate-log">
        <summary>Log</summary>
        <pre>{snap.log.slice(-120).join('\n')}</pre>
      </details>

      <details>
        <summary>When it's done</summary>
        <ul>
          <li>Drag the downloaded <code>.osz</code> files onto osu!lazer (or double-click them) to import.</li>
          <li>
            Maps in <code>unsubmitted/</code> on the PC and anything in failed.txt aren't on the mirrors:
            copy those over by hand.
          </li>
          {!canPickFolder && (
            <li>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={clearDownloadsHistory}>
                Forget what this browser already downloaded
              </button>
            </li>
          )}
        </ul>
      </details>
    </section>
  )
}
