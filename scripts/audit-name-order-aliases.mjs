/**
 * Audit + backfill given/family name-order aliases.
 * "Seol Kang" ↔ "Kang Seol" for two-token Latin names with Hangul native.
 *
 * Usage:
 *   node scripts/audit-name-order-aliases.mjs           # write audit JSON only
 *   node scripts/audit-name-order-aliases.mjs --apply   # also write aliases into manhwa.json
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data', 'manhwa.json')
const PROTAGS = join(ROOT, 'src', 'data', 'protagonists.json')
const OUT = join(ROOT, 'scripts', 'name-order-alias-audit.json')
const APPLY = process.argv.includes('--apply')

const HANGUL = /[\uac00-\ud7af]/
const LATIN_TOKEN = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’\-]*$/

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/gi, '')
}

function swapOrder(name) {
  const parts = name.trim().replace(/\s+/g, ' ').split(' ')
  if (parts.length !== 2 || !parts.every((p) => LATIN_TOKEN.test(p))) return null
  const swapped = `${parts[1]} ${parts[0]}`
  if (normalizeKey(swapped) === normalizeKey(name)) return null
  return swapped
}

const pool = JSON.parse(await readFile(DATA, 'utf8'))
const protagonists = JSON.parse(await readFile(PROTAGS, 'utf8')).protagonists || {}

const rows = []
let applied = 0

for (const manhwa of pool) {
  const title = manhwa.title?.english || manhwa.title?.romaji || `#${manhwa.id}`
  const protagId = Number(protagonists[String(manhwa.id)])

  for (const character of manhwa.characters || []) {
    const full = character.name?.full?.trim().replace(/\s+/g, ' ') || ''
    const native = character.name?.native?.trim() || ''
    if (!full || !HANGUL.test(native)) continue

    const swapped = swapOrder(full)
    if (!swapped) continue

    const alternatives = Array.isArray(character.name?.alternative)
      ? character.name.alternative.map((a) => String(a).trim()).filter(Boolean)
      : []
    const alreadyHas = alternatives.some((alt) => normalizeKey(alt) === normalizeKey(swapped))
    const isProtagonist = character.id === protagId

    rows.push({
      manhwaId: manhwa.id,
      title,
      characterId: character.id,
      role: character.role,
      isProtagonist,
      full,
      native,
      swapped,
      alreadyHadAlias: alreadyHas,
    })

    if (APPLY && !alreadyHas) {
      character.name.alternative = [...alternatives, swapped]
      applied++
    }
  }
}

rows.sort(
  (a, b) =>
    Number(b.isProtagonist) - Number(a.isProtagonist) ||
    a.full.localeCompare(b.full) ||
    a.manhwaId - b.manhwaId,
)

const needed = rows.filter((r) => !r.alreadyHadAlias)
const audit = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  alreadyHadAlias: rows.length - needed.length,
  neededAlias: needed.length,
  applied: APPLY ? applied : 0,
  note:
    'Two-token Latin names with Hangul native. Matching also accepts either order at runtime via nameOrderVariants.',
  entries: rows.map((r) => ({
    manhwaId: r.manhwaId,
    title: r.title,
    characterId: r.characterId,
    role: r.role,
    isProtagonist: r.isProtagonist,
    from: r.full,
    to: r.swapped,
    alreadyHadAlias: r.alreadyHadAlias,
  })),
}

await writeFile(OUT, JSON.stringify(audit, null, 2) + '\n')
if (APPLY) {
  await writeFile(DATA, JSON.stringify(pool, null, 2) + '\n')
}

console.log(`Total Hangul-native 2-token names: ${rows.length}`)
console.log(`Already had swap alias:           ${rows.length - needed.length}`)
console.log(`Needed swap alias:                ${needed.length}`)
if (APPLY) console.log(`Applied to manhwa.json:            ${applied}`)
console.log(`Wrote ${OUT}`)
console.log('\n=== ALL ENTRIES (from <-> to) ===')
for (const r of rows) {
  const tag = r.isProtagonist ? 'PROTAG' : r.role
  const flag = r.alreadyHadAlias ? 'had' : 'add'
  console.log(`${flag}\t${tag}\t${r.manhwaId}\t${r.full}\t<->\t${r.swapped}\t(${r.title})`)
}
