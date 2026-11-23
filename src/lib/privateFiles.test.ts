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

const SLUG = 'k3Jx9QpL2mVt8RwZ4yHc'
const TOKEN = 'tok_' + 'a'.repeat(40)
const OWNER = '11111111-1111-1111-1111-111111111111'
const OWNER_JWT = 'aaa.owner.sig'
const OTHER_JWT = 'aaa.other.sig'
const BASE = 'https://ref.supabase.co/functions/v1/private-files'
const IDS = '123\n456\n'

function deps(overrides: Partial<PrivateFilesDeps> = {}): PrivateFilesDeps {
  return {
    slug: SLUG,
    token: TOKEN,
    ownerId: OWNER,
    files: {
      'ids.txt': zlib.gzipSync(IDS).toString('base64'),
      'download.py': zlib.gzipSync('print(1)\n').toString('base64'),
    },
    getUserId: async (jwt) =>
      jwt === OWNER_JWT ? OWNER : jwt === OTHER_JWT ? 'someone-else' : null,
    ...overrides,
  }
}

function get(url: string, auth?: string, method = 'GET'): Request {
  return new Request(url, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  })
}

async function expect404(res: Response) {
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('Not Found')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
}

describe('private-files edge function', () => {
  it('serves an allowlisted file to the owner session JWT', async () => {
    const res = await handlePrivateFileRequest(
      get(`${BASE}/${SLUG}/ids.txt`, OWNER_JWT),
      deps(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(IDS)
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="ids.txt"',
    )
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
  })

  it('serves a file to a valid personal access token (curl)', async () => {
    const res = await handlePrivateFileRequest(
      get(`${BASE}/${SLUG}/download.py`, TOKEN),
      deps(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('print(1)\n')
  })

  it('also works when the path has no /functions/v1 prefix', async () => {
    const res = await handlePrivateFileRequest(
      get(`https://x.supabase.co/private-files/${SLUG}/ids.txt`, TOKEN),
      deps(),
    )
    expect(res.status).toBe(200)
  })

  it('404s logged-out visitors', async () => {
    await expect404(
      await handlePrivateFileRequest(get(`${BASE}/${SLUG}/ids.txt`), deps()),
    )
  })

  it('404s other signed-in users and garbage tokens', async () => {
    for (const auth of [OTHER_JWT, 'not-a-jwt', TOKEN + 'x', 'aaa.bad.sig']) {
      await expect404(
        await handlePrivateFileRequest(
          get(`${BASE}/${SLUG}/ids.txt`, auth),
          deps(),
        ),
      )
    }
  })

  it('404s a wrong slug or a non-allowlisted filename, even for the owner', async () => {
    for (const url of [
      `${BASE}/wrong-slug-wrong-slug/ids.txt`,
      `${BASE}/${SLUG}/secrets.txt`,
      `${BASE}/${SLUG}/index.ts`,
      `${BASE}/${SLUG}/__proto__`,
      `${BASE}/${SLUG}/constructor`,
      `${BASE}/${SLUG}`,
      `${BASE}/${SLUG}/ids.txt/extra`,
    ]) {
      await expect404(
        await handlePrivateFileRequest(get(url, TOKEN), deps()),
      )
    }
  })

  it('404s an allowlisted name that has not been bundled yet', async () => {
    await expect404(
      await handlePrivateFileRequest(
        get(`${BASE}/${SLUG}/ids.txt`, TOKEN),
        deps({ files: {} }),
      ),
    )
  })

  it('blocks path traversal and encoded separators', () => {
    for (const p of [
      `/private-files/${SLUG}/..%2Findex.ts`,
      `/private-files/${SLUG}/%2e%2e`,
      `/private-files/${SLUG}/..`,
      `/private-files/${SLUG}/a\\b`,
      `/private-files/${SLUG}//ids.txt`,
      `/private-files/${SLUG}/%2Fetc%2Fpasswd`,
      `/private-files/../${SLUG}/ids.txt`,
    ]) {
      expect(parsePrivatePath(p)).toBeNull()
    }
    expect(parsePrivatePath(`/private-files/${SLUG}/ids.txt`)).toEqual({
      slug: SLUG,
      filename: 'ids.txt',
    })
  })

  it('turns off token access when PRIVATE_FILES_TOKEN is unset', async () => {
    await expect404(
      await handlePrivateFileRequest(
        get(`${BASE}/${SLUG}/ids.txt`, TOKEN),
        deps({ token: undefined }),
      ),
    )
  })

  it('is fully disabled without a slug, and 404s non-GET methods', async () => {
    await expect404(
      await handlePrivateFileRequest(
        get(`${BASE}/${SLUG}/ids.txt`, TOKEN),
        deps({ slug: undefined }),
      ),
    )
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      await expect404(
        await handlePrivateFileRequest(
          get(`${BASE}/${SLUG}/ids.txt`, TOKEN, method),
          deps(),
        ),
      )
    }
  })

  it('serves the slug-less browser route to the owner session only', async () => {
    const url = `${BASE}/ids.txt`
    const ok = await handlePrivateFileRequest(get(url, OWNER_JWT), deps())
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe(IDS)
    // The curl token is only good on the slug route.
    await expect404(await handlePrivateFileRequest(get(url, TOKEN), deps()))
    await expect404(await handlePrivateFileRequest(get(url, OTHER_JWT), deps()))
    await expect404(await handlePrivateFileRequest(get(url), deps()))
    await expect404(
      await handlePrivateFileRequest(get(`${BASE}/index.ts`, OWNER_JWT), deps()),
    )
  })

  it('answers the CORS preflight only for allowlisted site origins', async () => {
    const site = 'https://manhwadle.net'
    const env = { allowedOriginsEnv: `${site},https://*.pages.dev` }
    const pre = (origin: string) =>
      new Request(`${BASE}/ids.txt`, {
        method: 'OPTIONS',
        headers: { Origin: origin },
      })

    const ok = await handlePrivateFileRequest(pre(site), deps(env))
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(site)
    expect(ok.headers.get('Access-Control-Allow-Headers')).toContain(
      'authorization',
    )

    await expect404(
      await handlePrivateFileRequest(pre('https://evil.example'), deps(env)),
    )

    const res = await handlePrivateFileRequest(
      new Request(`${BASE}/ids.txt`, {
        headers: { Origin: site, Authorization: `Bearer ${OWNER_JWT}` },
      }),
      deps(env),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(site)
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain(
      'Content-Disposition',
    )
  })

  it('keeps the bundler allowlist in sync and private files out of git and public/', () => {
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

  it('never logs from the function', () => {
    for (const f of ['index.ts', 'handler.ts']) {
      const src = fs.readFileSync(
        path.resolve('supabase/functions/private-files', f),
        'utf8',
      )
      expect(src).not.toMatch(/console\./)
    }
  })
})
