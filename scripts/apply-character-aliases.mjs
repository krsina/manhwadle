/**
 * Merge src/data/character-aliases.json into src/data/manhwa.json in place.
 * Safe to re-run; dedupes case-insensitively against full + existing alternatives.
 *
 * Usage: node scripts/apply-character-aliases.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data')

function mergeCharacterAliases(pool, aliasMap) {
  let touched = 0
  let added = 0
  for (const m of pool) {
    for (const character of m.characters || []) {
      const extra = aliasMap[String(character.id)]
      if (!Array.isArray(extra) || extra.length === 0) continue
      const fullKey = (character.name?.full || '').trim().toLowerCase()
      const alts = [...(character.name?.alternative || [])]
      const seen = new Set(alts.map((a) => a.trim().toLowerCase()).filter(Boolean))
      if (fullKey) seen.add(fullKey)
      let localAdded = 0
      for (const raw of extra) {
        const a = String(raw || '').trim()
        if (!a) continue
        const key = a.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        alts.push(a)
        localAdded += 1
      }
      if (localAdded > 0) {
        character.name.alternative = alts
        touched += 1
        added += localAdded
      }
    }
  }
  return { touched, added }
}

const pool = JSON.parse(await readFile(join(DATA, 'manhwa.json'), 'utf8'))
const doc = JSON.parse(await readFile(join(DATA, 'character-aliases.json'), 'utf8'))
const aliasMap = doc.aliases && typeof doc.aliases === 'object' ? doc.aliases : {}
const { touched, added } = mergeCharacterAliases(pool, aliasMap)
await writeFile(join(DATA, 'manhwa.json'), JSON.stringify(pool, null, 2) + '\n', 'utf8')
console.log(
  `Applied character-aliases.json: ${added} new alternative(s) on ${touched} character(s)`,
)
