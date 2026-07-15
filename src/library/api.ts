import type { LibrarySavePayload } from './types'

export async function saveLibraryToDisk(payload: LibrarySavePayload): Promise<{
  ok: boolean
  error?: string
  saved?: { manhwa: number; blurbs: number; crops: number }
}> {
  const response = await fetch('/__library/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as {
    ok: boolean
    error?: string
    saved?: { manhwa: number; blurbs: number; crops: number }
  }

  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || `Save failed (${response.status})` }
  }

  return data
}
