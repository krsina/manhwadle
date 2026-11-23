import { idFromFileName, type MapSink, type MapWriter } from './osuMigration'

// Minimal File System Access API types (Chromium only; not in TS's DOM lib).
interface WritableFileStream {
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}
interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableFileStream>
}
interface DirectoryHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterable<FileHandle | DirectoryHandle>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string): Promise<void>
}
type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }) => Promise<DirectoryHandle>
}

export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Ask for a folder and save maps straight into it. Null if the user cancels. */
export async function pickFolderSink(): Promise<MapSink | null> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) return null
  let dir: DirectoryHandle
  try {
    dir = await picker.call(window, { id: 'osu-maps', mode: 'readwrite', startIn: 'downloads' })
  } catch {
    return null // cancelled
  }
  return {
    label: `folder “${dir.name}”`,
    async existingIds() {
      const ids = new Set<string>()
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file') continue
        const id = idFromFileName(entry.name)
        if (!id) continue
        // A crash mid-write leaves an empty file; don't count it as done.
        if ((await entry.getFile()).size > 0) ids.add(id)
      }
      return ids
    },
    async open(_id, fileName): Promise<MapWriter> {
      const handle = await dir.getFileHandle(fileName, { create: true })
      const stream = await handle.createWritable()
      return {
        write: (chunk) => stream.write(chunk),
        close: () => stream.close(),
        async abort() {
          await stream.abort().catch(() => {})
          await dir.removeEntry(fileName).catch(() => {})
        },
      }
    },
  }
}

const DONE_KEY = 'manhwadle.osuMigration.downloaded'

function readDone(): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function markDone(id: string) {
  try {
    const done = readDone()
    done.add(id)
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]))
  } catch {
    // Storage unavailable: the map just won't be skipped next time.
  }
}

/** Forget which maps the Downloads fallback already saved. */
export function clearDownloadsHistory(): void {
  try {
    localStorage.removeItem(DONE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Fallback for browsers without folder access (Safari, Firefox): each map is
 * saved as a normal download. The browser can't list Downloads, so finished
 * ids are remembered in this browser instead.
 */
export function downloadsSink(): MapSink {
  return {
    label: 'your Downloads folder',
    async existingIds() {
      return readDone()
    },
    async open(id, fileName): Promise<MapWriter> {
      const parts: Uint8Array[] = []
      return {
        async write(chunk) {
          parts.push(chunk)
        },
        async close() {
          const href = URL.createObjectURL(
            new Blob(parts as BlobPart[], { type: 'application/octet-stream' }),
          )
          const link = document.createElement('a')
          link.href = href
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(href), 60_000)
          markDone(id)
        },
        async abort() {
          parts.length = 0
        },
      }
    },
  }
}
