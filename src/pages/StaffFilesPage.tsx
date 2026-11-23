import { useState } from 'react'
import {
  PRIVATE_FILE_NAMES,
  downloadPrivateFile,
  type PrivateFileName,
} from '../lib/privateFilesApi'

export function StaffFilesPage() {
  const [busy, setBusy] = useState<PrivateFileName | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onDownload(name: PrivateFileName) {
    setBusy(name)
    setMessage(null)
    const result = await downloadPrivateFile(name)
    setBusy(null)
    setMessage(result.ok ? `Downloaded ${name}.` : result.error)
  }

  return (
    <section className="staff-console-panel" aria-labelledby="staff-files-heading">
      <h2 id="staff-files-heading">Private files</h2>
      <p>Owner-only downloads. Each request is checked against your session on the server.</p>
      <div className="staff-nav">
        {PRIVATE_FILE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => void onDownload(name)}
          >
            {busy === name ? 'Downloading…' : `Download ${name}`}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  )
}
