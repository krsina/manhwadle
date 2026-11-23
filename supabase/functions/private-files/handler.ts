/**
 * Owner-only private file downloads.
 *
 * Routes:
 *   /functions/v1/private-files/<PRIVATE_FILES_SLUG>/<filename>
 *       curl: PRIVATE_FILES_TOKEN bearer, or the owner's session JWT.
 *   /functions/v1/private-files/<filename>
 *       browser (Staff → Files): the owner's session JWT only. No slug, so
 *       nothing secret has to ship in the public JS bundle.
 *
 * Everything that is not an allowed, authorised download gets the same plain
 * 404 (wrong method, wrong slug, unknown file, traversal attempt, missing or
 * bad credentials, non-owner account, feature not configured). The one
 * exception is the CORS preflight (OPTIONS) from an allowlisted site origin,
 * which browsers need before they will send the Authorization header.
 * Nothing here logs request headers.
 *
 * Pure logic with injected dependencies so it runs under Deno (Edge Runtime)
 * and Vitest alike.
 */

import { resolveAllowOrigin, parseAllowedOrigins } from '../_shared/cors.ts'

export const FUNCTION_NAME = 'private-files'

/** The only files this endpoint will ever serve. */
export const ALLOWED_FILES: Readonly<Record<string, string>> = Object.freeze({
  'download.py': 'text/x-python; charset=utf-8',
  'ids.txt': 'text/plain; charset=utf-8',
})

/** Slugs and tokens shorter than this are treated as "not configured". */
export const MIN_SLUG_LENGTH = 16
export const MIN_TOKEN_LENGTH = 32

export interface PrivateFilesDeps {
  /** PRIVATE_FILES_SLUG — secret path segment. Unset → endpoint disabled. */
  slug: string | undefined
  /** PRIVATE_FILES_TOKEN — curl bearer token. Unset → token access off. */
  token: string | undefined
  /** PRIVATE_FILES_OWNER_ID — the only Supabase user id allowed via session JWT. */
  ownerId: string | undefined
  /** Base64(gzip(file)) keyed by filename (built from the local files folder). */
  files: Readonly<Record<string, string>>
  /** Verify a Supabase session JWT and return its user id, or null. */
  getUserId: (jwt: string) => Promise<string | null>
  /** CORS_ALLOWED_ORIGINS (shared with moderation/account-data). */
  allowedOriginsEnv?: string | undefined
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
} as const

export function notFound(cors: Record<string, string> = {}): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      ...BASE_HEADERS,
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

/** CORS headers for an allowlisted Origin; empty for everyone else. */
function corsFor(
  req: Request,
  deps: PrivateFilesDeps,
): Record<string, string> {
  const origin = resolveAllowOrigin(
    req.headers.get('Origin'),
    parseAllowedOrigins(deps.allowedOriginsEnv),
  )
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * Pull `<slug>/<filename>` (or just `<filename>`, slug null) out of the raw,
 * still percent-encoded pathname.
 * Hosted Edge Functions see `/private-files/...`; some proxies keep the
 * `/functions/v1` prefix. Anything encoded, dotted-only or nested is rejected.
 */
export function parsePrivatePath(
  pathname: string,
): { slug: string | null; filename: string } | null {
  const parts = pathname.split('/').filter((p) => p.length > 0)
  const fnIndex = parts.indexOf(FUNCTION_NAME)
  if (fnIndex === -1) return null
  const rest = parts.slice(fnIndex + 1)
  if (rest.length !== 1 && rest.length !== 2) return null
  // Exact empty-segment check too: `//` would have been dropped above.
  if (pathname.includes('//')) return null
  const slug = rest.length === 2 ? rest[0] : null
  const filename = rest[rest.length - 1]
  for (const seg of rest) {
    if (!SAFE_SEGMENT.test(seg)) return null // blocks %2e, %2f, \, :, etc.
    if (seg === '.' || seg === '..') return null
  }
  return { slug, filename }
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return new Uint8Array(digest)
}

/** Constant-time string comparison (hash first so lengths always match). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i]
  return diff === 0
}

function bearer(req: Request): string | null {
  const header = req.headers.get('Authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return match ? match[1] : null
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

async function isAuthorised(
  req: Request,
  deps: PrivateFilesDeps,
  allowToken: boolean,
): Promise<boolean> {
  const presented = bearer(req)
  if (!presented) return false

  const token = deps.token?.trim()
  if (allowToken && token && token.length >= MIN_TOKEN_LENGTH) {
    if (await safeEqual(presented, token)) return true
  }

  const ownerId = deps.ownerId?.trim()
  if (ownerId && JWT_SHAPE.test(presented)) {
    try {
      const userId = await deps.getUserId(presented)
      if (userId && (await safeEqual(userId, ownerId))) return true
    } catch {
      return false
    }
  }
  return false
}

/** Files are bundled as base64 of gzip (keeps the deploy payload small). */
async function decodeBundled(b64: string): Promise<Uint8Array> {
  const bin = atob(b64)
  const gz = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i)
  const stream = new Blob([gz])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function handlePrivateFileRequest(
  req: Request,
  deps: PrivateFilesDeps,
): Promise<Response> {
  const cors = corsFor(req, deps)

  if (req.method === 'OPTIONS') {
    // Preflight only for the site's own origins; everyone else sees a 404.
    if (!cors['Access-Control-Allow-Origin']) return notFound()
    return new Response(null, { status: 204, headers: cors })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(cors)

  const parsed = parsePrivatePath(new URL(req.url).pathname)
  if (!parsed) return notFound(cors)

  // Slug route: needs the configured slug. Slug-less route: owner session only.
  if (parsed.slug !== null) {
    const slug = deps.slug?.trim()
    if (!slug || slug.length < MIN_SLUG_LENGTH) return notFound(cors)
    if (!(await safeEqual(parsed.slug, slug))) return notFound(cors)
  }

  const { filename } = parsed
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FILES, filename)) {
    return notFound(cors)
  }
  if (!Object.prototype.hasOwnProperty.call(deps.files, filename)) {
    return notFound(cors)
  }

  if (!(await isAuthorised(req, deps, parsed.slug !== null))) {
    return notFound(cors)
  }

  const body = await decodeBundled(deps.files[filename])
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      ...cors,
      'Content-Type': ALLOWED_FILES[filename],
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
