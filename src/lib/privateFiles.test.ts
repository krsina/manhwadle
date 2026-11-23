import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_FILES,
  handlePrivateFileRequest,
  parsePrivatePath,
  type PrivateFilesDeps,
} from '../../supabase/functions/private-files/handler.ts'
import { PRIVATE_FILE_NAMES as CLIENT_FILE_NAMES } from './privateFilesApi'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OWNER_JWT = 'aaa.owner.sig'
const OTHER_JWT = 'aaa.other.sig'
const BASE = 'https://ref.supabase.co/functions/v1/private-files'
const IDS = '123\n456\n'
const SITE = 'https://manhwadle.net'

function deps(overrides: Partial<PrivateFilesDeps> = {}): PrivateFilesDeps {
  return {
    ownerId: OWNER,
    files: {
      'ids.txt': zlib.gzipSync(IDS).toString('base64'),
      'download.py': zlib.gzipSync('print(1)\n').toString('base64'),
    },
    getUserId: async (jwt) =>
      jwt === OWNER_JWT ? OWNER : jwt === OTHER_JWT ? 'someone-else' : null,
    allowedOriginsEnv: `${SITE},https://*.pages.dev`,
    ...overrides,
  }
}

function req(
  url: string,
  opts: { auth?: string; method?: string; origin?: string } = {},
): Request {
  const headers: Record<string, string> = {}
  if (opts.auth) headers.Authorization = `Bearer ${opts.auth}`
  if (opts.origin) headers.Origin = opts.origin
  return new Request(url, { method: opts.method ?? 'GET', headers })
}

async function expect404(res: Response) {
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('Not Found')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
}

describe('private-files edge function', () => {
  it('serves an allowlisted file to the owner session', async () => {
    const res = await handlePrivateFileRequest(
      req(`${BASE}/ids.txt`, { auth: OWNER_JWT, origin: SITE }),
      deps(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(IDS)
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="ids.txt"',
    )
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain(
      'Content-Disposition',
    )
  })

  it('also works when the path has no /functions/v1 prefix', async () => {
    const res = await handlePrivateFileRequest(
      req('https://x.supabase.co/private-files/download.py', { auth: OWNER_JWT }),
      deps(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('print(1)\n')
  })

  it('404s logged-out visitors, other users and non-JWT bearers', async () => {
    for (const auth of [undefined, OTHER_JWT, 'aaa.bad.sig', 'tok_' + 'a'.repeat(40)]) {
      await expect404(
        await handlePrivateFileRequest(req(`${BASE}/ids.txt`, { auth }), deps()),
      )
    }
  })

  it('404s non-allowlisted names and the old slug-style paths, even for the owner', async () => {
    for (const url of [
      `${BASE}/secrets.txt`,
      `${BASE}/index.ts`,
      `${BASE}/__proto__`,
      `${BASE}/constructor`,
      `${BASE}/k3Jx9QpL2mVt8RwZ4yHc/ids.txt`,
      `${BASE}/ids.txt/extra`,
      BASE,
    ]) {
      await expect404(
        await handlePrivateFileRequest(req(url, { auth: OWNER_JWT }), deps()),
      )
    }
  })

  it('404s an allowlisted name that has not been bundled yet', async () => {
    await expect404(
      await handlePrivateFileRequest(
        req(`${BASE}/ids.txt`, { auth: OWNER_JWT }),
        deps({ files: {} }),
      ),
    )
  })

  it('is disabled when PRIVATE_FILES_OWNER_ID is unset', async () => {
    await expect404(
      await handlePrivateFileRequest(
        req(`${BASE}/ids.txt`, { auth: OWNER_JWT }),
        deps({ ownerId: undefined }),
      ),
    )
  })

  it('blocks path traversal and encoded separators', () => {
    for (const p of [
      '/private-files/..%2Findex.ts',
      '/private-files/%2e%2e',
      '/private-files/..',
      '/private-files/a\\b',
      '/private-files//ids.txt',
      '/private-files/%2Fetc%2Fpasswd',
    ]) {
      expect(parsePrivatePath(p)).toBeNull()
    }
    expect(parsePrivatePath('/private-files/ids.txt')).toBe('ids.txt')
  })

  it('answers the CORS preflight only for allowlisted site origins', async () => {
    const ok = await handlePrivateFileRequest(
      req(`${BASE}/ids.txt`, { method: 'OPTIONS', origin: SITE }),
      deps(),
    )
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(ok.headers.get('Access-Control-Allow-Headers')).toContain('authorization')

    for (const origin of ['https://evil.example', undefined]) {
      await expect404(
        await handlePrivateFileRequest(
          req(`${BASE}/ids.txt`, { method: 'OPTIONS', origin }),
          deps(),
        ),
      )
    }
  })

  it('404s methods other than GET/HEAD/OPTIONS', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      await expect404(
        await handlePrivateFileRequest(
          req(`${BASE}/ids.txt`, { auth: OWNER_JWT, method }),
          deps(),
        ),
      )
    }
  })

  it('keeps allowlists in sync and private files out of git and public/', () => {
    const script = fs.readFileSync(
      path.resolve('scripts/build-private-files.mjs'),
      'utf8',
    )
    const m = /PRIVATE_FILE_NAMES = (\[[^\]]*\])/.exec(script)
    expect(m).not.toBeNull()
    expect(JSON.parse(m![1].replace(/'/g, '"'))).toEqual(
      Object.keys(ALLOWED_FILES),
    )
    expect([...CLIENT_FILE_NAMES]).toEqual(Object.keys(ALLOWED_FILES))

    const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8')
    expect(gitignore).toContain('supabase/functions/private-files/files/*')
    expect(gitignore).toContain(
      'supabase/functions/private-files/files.generated.ts',
    )

    const config = fs
      .readFileSync(path.resolve('supabase/config.toml'), 'utf8')
      .replace(/\r\n/g, '\n')
    expect(config).toMatch(/\[functions\.private-files\]\s*\nverify_jwt = false/)

    const robots = fs.readFileSync(path.resolve('public/robots.txt'), 'utf8')
    const sitemap = fs.readFileSync(path.resolve('public/sitemap.xml'), 'utf8')
    expect(robots).not.toMatch(/private/i)
    expect(sitemap).not.toMatch(/private/i)
  })

  it('has no token or slug access path and never logs', () => {
    for (const f of ['index.ts', 'handler.ts']) {
      const src = fs.readFileSync(
        path.resolve('supabase/functions/private-files', f),
        'utf8',
      )
      expect(src).not.toMatch(/console\./)
      expect(src).not.toMatch(/PRIVATE_FILES_(TOKEN|SLUG)/)
    }
  })
})
