/**
 * Owner-only private file downloads (Staff → Files).
 *
 * Route: /functions/v1/private-files/<filename>
 * Auth:  the owner's Supabase session JWT (Authorization: Bearer <jwt>),
 *        matched against PRIVATE_FILES_OWNER_ID.
 *
 * Everything that is not an allowed, authorised download gets the same plain
 * 404 (wrong method, unknown file, traversal attempt, missing or bad session,
 * non-owner account, feature not configured). The one exception is the CORS
 * preflight (OPTIONS) from an allowlisted site origin, which browsers need
 * before they will send the Authorization header. Nothing here logs.
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

export interface PrivateFilesDeps {
  /** PRIVATE_FILES_OWNER_ID — the only Supabase user id allowed. Unset → disabled. */
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
 * Pull `<filename>` out of the raw, still percent-encoded pathname.
 * Hosted Edge Functions see `/private-files/...`; some proxies keep the
 * `/functions/v1` prefix. Anything encoded, dotted-only or nested is rejected.
 */
export function parsePrivatePath(pathname: string): string | null {
  if (pathname.includes('//')) return null
  const parts = pathname.split('/').filter((p) => p.length > 0)
  const fnIndex = parts.indexOf(FUNCTION_NAME)
  if (fnIndex === -1) return null
  const rest = parts.slice(fnIndex + 1)
  if (rest.length !== 1) return null
  const [filename] = rest
  if (!SAFE_SEGMENT.test(filename)) return null // blocks %2e, %2f, \, :, etc.
  if (filename === '.' || filename === '..') return null
  return filename
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

const BEARER_JWT =
  /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/i

async function isOwner(req: Request, deps: PrivateFilesDeps): Promise<boolean> {
  const ownerId = deps.ownerId?.trim()
  if (!ownerId) return false
  const match = BEARER_JWT.exec(req.headers.get('Authorization') ?? '')
  if (!match) return false
  try {
    const userId = await deps.getUserId(match[1])
    return userId !== null && (await safeEqual(userId, ownerId))
  } catch {
    return false
  }
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

  const filename = parsePrivatePath(new URL(req.url).pathname)
  if (!filename) return notFound(cors)
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FILES, filename)) {
    return notFound(cors)
  }
  if (!Object.prototype.hasOwnProperty.call(deps.files, filename)) {
    return notFound(cors)
  }
  if (!(await isOwner(req, deps))) return notFound(cors)

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
