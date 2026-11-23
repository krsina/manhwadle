import { supabase } from './supabase'

/** Keep in sync with ALLOWED_FILES in supabase/functions/private-files/handler.ts. */
export const PRIVATE_FILE_NAMES = ['download.py', 'ids.txt'] as const
export type PrivateFileName = (typeof PRIVATE_FILE_NAMES)[number]

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Fetch an owner-only file with the signed-in session. The server checks the
 * session belongs to the owner and answers 404 for anyone else.
 */
async function fetchPrivateFile(name: PrivateFileName): Promise<Result<Blob>> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured' }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sign in to continue.' }

  let response: Response
  try {
    response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/private-files/${name}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    )
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
  if (!response.ok) {
    return {
      ok: false,
      error:
        response.status === 404
          ? 'Not available (file not deployed, or this account is not the owner).'
          : `Request failed (${response.status})`,
    }
  }
  return { ok: true, value: await response.blob() }
}

/** Read an owner-only text file (e.g. ids.txt). */
export async function fetchPrivateFileText(
  name: PrivateFileName,
): Promise<Result<string>> {
  const res = await fetchPrivateFile(name)
  return res.ok ? { ok: true, value: await res.value.text() } : res
}

/** Save an owner-only file through the browser's download flow. */
export async function downloadPrivateFile(
  name: PrivateFileName,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetchPrivateFile(name)
  if (!res.ok) return res
  saveBlob(res.value, name)
  return { ok: true }
}

export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}
