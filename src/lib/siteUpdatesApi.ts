import { isSupabaseConfigured, supabase } from './supabase'

export interface SiteUpdate {
  id: string
  slug: string
  title: string
  body: string
  version: string | null
  published: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export function parseSiteUpdate(raw: unknown): SiteUpdate | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.slug !== 'string') return null
  if (typeof row.title !== 'string' || typeof row.body !== 'string') return null
  if (typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    version: typeof row.version === 'string' ? row.version : null,
    published: row.published === true,
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function formatUpdateDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}

/** Split changelog body into paragraphs (blank-line separated). */
export function splitUpdateBody(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export async function fetchPublicSiteUpdates(limit = 50): Promise<
  { ok: true; updates: SiteUpdate[] } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_public_site_updates', {
    p_limit: limit,
    p_offset: 0,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
    return { ok: false, error: 'unexpected_response' }
  }
  const rows = (data as { updates?: unknown }).updates
  if (!Array.isArray(rows)) return { ok: false, error: 'unexpected_response' }
  const updates = rows.map(parseSiteUpdate).filter((row): row is SiteUpdate => row !== null)
  return { ok: true, updates }
}

export async function fetchPublicSiteUpdate(slug: string): Promise<
  { ok: true; update: SiteUpdate } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'unconfigured' }
  }
  const { data, error } = await supabase.rpc('get_public_site_update', {
    p_slug: slug,
  })
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'unexpected_response' }
  }
  const payload = data as { ok?: boolean; error?: string; update?: unknown }
  if (payload.ok !== true) {
    return { ok: false, error: typeof payload.error === 'string' ? payload.error : 'not_found' }
  }
  const update = parseSiteUpdate(payload.update)
  if (!update) return { ok: false, error: 'unexpected_response' }
  return { ok: true, update }
}
