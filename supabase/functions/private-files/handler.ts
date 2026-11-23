/**
 * Owner-only private file downloads.
 *
 * Route: /functions/v1/private-files/<PRIVATE_FILES_SLUG>/<filename>
 *
 * Everything that is not an allowed, authorised download gets the same plain
 * 404 (wrong method, wrong slug, unknown file, traversal attempt, missing or
 * bad credentials, non-owner account, feature not configured), so the route
 * does not reveal that it exists. Nothing here logs request headers.
 *
 * Pure logic with injected dependencies so it runs under Deno (Edge Runtime)
 * and Vitest alike.
 */

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
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
} as const

export function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * Pull `<slug>/<filename>` out of the raw (still percent-encoded) pathname.
 * Hosted Edge Functions see `/private-files/...`; some proxies keep the
 * `/functions/v1` prefix. Anything encoded, dotted-only or nested is rejected.
 */
export function parsePrivatePath(
  pathname: string,
): { slug: string; filename: string } | null {
  const parts = pathname.split('/').filter((p) => p.length > 0)
  const fnIndex = parts.indexOf(FUNCTION_NAME)
  if (fnIndex === -1) return null
  const rest = parts.slice(fnIndex + 1)
  if (rest.length !== 2) return null
  // Exact empty-segment check too: `//` would have been dropped above.
  if (pathname.includes('//')) return null
  const [slug, filename] = rest
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
): Promise<boolean> {
  const presented = bearer(req)
  if (!presented) return false

  const token = deps.token?.trim()
  if (token && token.length >= MIN_TOKEN_LENGTH) {
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
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound()

  const slug = deps.slug?.trim()
  if (!slug || slug.length < MIN_SLUG_LENGTH) return notFound()

  const parsed = parsePrivatePath(new URL(req.url).pathname)
  if (!parsed) return notFound()
  if (!(await safeEqual(parsed.slug, slug))) return notFound()

  const { filename } = parsed
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FILES, filename)) {
    return notFound()
  }
  if (!Object.prototype.hasOwnProperty.call(deps.files, filename)) {
    return notFound()
  }

  if (!(await isAuthorised(req, deps))) return notFound()

  const body = await decodeBundled(deps.files[filename])
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': ALLOWED_FILES[filename],
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
