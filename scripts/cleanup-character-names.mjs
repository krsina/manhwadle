/**
 * Cleanup remaining character-name issues found by audit:
 * - collapse double spaces in full names
 * - fix duplicated given-name "Soo-Young Soo-Young" → "Soo-Young Park" (박수영)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'src', 'data', 'manhwa.json')

const MANUAL = new Map([
  // AniList duplicated given name; native 박수영
  [346352, { full: 'Soo-Young Park', keepOldAsAlt: true }],
])

const pool = JSON.parse(await readFile(DATA, 'utf8'))
let spaceFixes = 0
let manualFixes = 0

for (const manhwa of pool) {
  for (const character of manhwa.characters || []) {
    if (!character.name) continue

    const manual = MANUAL.get(character.id)
    if (manual) {
      const old = character.name.full?.trim() || null
      if (old && old !== manual.full) {
        character.name.full = manual.full
        const alts = Array.isArray(character.name.alternative)
          ? [...character.name.alternative]
          : []
        if (manual.keepOldAsAlt && old && !alts.some((a) => a.toLowerCase() === old.toLowerCase())) {
          alts.push(old)
        }
        character.name.alternative = alts
        manualFixes++
      }
    }

    if (typeof character.name.full === 'string' && /\s{2,}/.test(character.name.full)) {
      character.name.full = character.name.full.replace(/\s+/g, ' ').trim()
      spaceFixes++
    }

    if (Array.isArray(character.name.alternative)) {
      character.name.alternative = character.name.alternative.map((a) =>
        String(a).replace(/\s+/g, ' ').trim(),
      )
    }
  }
}

await writeFile(DATA, `${JSON.stringify(pool, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ spaceFixes, manualFixes }, null, 2))
