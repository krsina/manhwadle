import { supabase } from './supabase'

/** Keep in sync with ALLOWED_FILES in supabase/functions/private-files/handler.ts. */
export const PRIVATE_FILE_NAMES = ['download.py', 'ids.txt'] as const
export type PrivateFileName = (typeof PRIVATE_FILE_NAMES)[number]

/**
 * Download an owner-only file with the signed-in session. The server checks
 * the session belongs to the owner and answers 404 for anyone else.
 */
export async function downloadPrivateFile(
  name: PrivateFileName,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
  return { ok: true }
}
