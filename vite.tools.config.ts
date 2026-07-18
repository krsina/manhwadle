import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const manhwaPath = path.join(rootDir, 'src/data/manhwa.json')
const blurbsPath = path.join(rootDir, 'src/data/storyDescriptionBlurb.json')
const cropsPath = path.join(rootDir, 'src/data/characterCrop.json')
const catalogPath = path.join(rootDir, 'manhwadle-etl/output/catalog.json')
const enrichCheckpointPath = path.join(
  rootDir,
  'manhwadle-etl/output/catalog.enrich-images.checkpoint.json',
)

/** Dev-only: save a manual character image URL into the ETL catalog. */
function characterImageSavePlugin(): Plugin {
  return {
    name: 'character-image-save',
    configureServer(server) {
      server.middlewares.use(
        '/__character-images/save',
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== 'POST') {
            next()
            return
          }

          try {
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              characterId?: unknown
              imageUrl?: unknown
            }

            const characterId = Number(body.characterId)
            const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''

            if (!Number.isFinite(characterId) || characterId <= 0) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'Invalid characterId' }))
              return
            }
            if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'imageUrl must be http(s)' }))
              return
            }
            if (!fs.existsSync(catalogPath)) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'catalog.json not found' }))
              return
            }

            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
              characters?: Array<{
                id: number
                image?: { large?: string | null; medium?: string | null }
              }>
            }
            const character = (catalog.characters || []).find((c) => c.id === characterId)
            if (!character) {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'Character not in catalog' }))
              return
            }

            const nextImage = imageUrl
              ? { large: imageUrl, medium: imageUrl }
              : {
                  large: 'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg',
                  medium: 'https://s4.anilist.co/file/anilistcdn/character/medium/default.jpg',
                }
            character.image = nextImage
            fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')

            if (fs.existsSync(enrichCheckpointPath)) {
              const ck = JSON.parse(fs.readFileSync(enrichCheckpointPath, 'utf8')) as {
                filled?: Record<string, unknown>
                unmatched?: Record<string, string>
                manualAllowlist?: { characterIds?: number[] }
                updatedAt?: string
              }
              ck.filled = ck.filled || {}
              ck.unmatched = ck.unmatched || {}
              if (imageUrl) {
                ck.filled[String(characterId)] = {
                  image: imageUrl,
                  source: 'manual',
                  malName: null,
                  malId: null,
                  idMal: null,
                  manual: true,
                }
                delete ck.unmatched[String(characterId)]
                if (ck.manualAllowlist?.characterIds) {
                  ck.manualAllowlist.characterIds = ck.manualAllowlist.characterIds.filter(
                    (id) => id !== characterId,
                  )
                }
              } else {
                delete ck.filled[String(characterId)]
                ck.unmatched[String(characterId)] = 'manual_tyrant'
              }
              ck.updatedAt = new Date().toISOString()
              fs.writeFileSync(
                enrichCheckpointPath,
                `${JSON.stringify(ck, null, 2)}\n`,
                'utf8',
              )
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, characterId, imageUrl: imageUrl || null }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Save failed',
              }),
            )
          }
        },
      )
    },
  }
}

/** Dev-only endpoints so the library editor can write JSON back to disk. */
function librarySavePlugin(): Plugin {
  return {
    name: 'library-save',
    configureServer(server) {
      server.middlewares.use(
        '/__library/save',
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== 'POST') {
            next()
            return
          }

          try {
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              manhwa?: unknown
              blurbs?: { entries?: unknown }
              crops?: { entries?: unknown }
            }

            if (
              !Array.isArray(body.manhwa) ||
              !body.blurbs ||
              !Array.isArray(body.blurbs.entries) ||
              !body.crops ||
              !Array.isArray(body.crops.entries)
            ) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'Invalid payload shape' }))
              return
            }

            fs.writeFileSync(manhwaPath, `${JSON.stringify(body.manhwa, null, 2)}\n`, 'utf8')
            fs.writeFileSync(blurbsPath, `${JSON.stringify(body.blurbs, null, 2)}\n`, 'utf8')
            fs.writeFileSync(cropsPath, `${JSON.stringify(body.crops, null, 2)}\n`, 'utf8')

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: true,
                saved: {
                  manhwa: body.manhwa.length,
                  blurbs: body.blurbs.entries.length,
                  crops: body.crops.entries.length,
                },
              }),
            )
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Save failed',
              }),
            )
          }
        },
      )
    },
  }
}

/**
 * Dev/tools Vite config for library editor + character-image review.
 * Never used for production `npm run build`.
 */
export default defineConfig({
  plugins: [react(), librarySavePlugin(), characterImageSavePlugin()],
  build: {
    outDir: 'dist-tools',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        library: path.resolve(rootDir, 'library.html'),
        characterImages: path.resolve(rootDir, 'character-images.html'),
      },
    },
  },
})
