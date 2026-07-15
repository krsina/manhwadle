/**
 * Audit character name quality in src/data/manhwa.json.
 * Reports remaining broken romanizations, missing display names, and
 * cases where a better Latin alternative exists but wasn't applied.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data', 'manhwa.json')
const OUT = join(ROOT, 'scripts', 'character-name-audit.json')

const EPITHET =
  /\b(bastard|dancer|hunter|emperor|poisoner|slaughterer|crew|mobster|sunfish|mad cow|king|queen|prince|princess|duke|duchess|marquis|count|baron|lady|lord|captain|boss|god|spirit|intermediate|saintess|emperor|empress|woman with|man with|gongjak|hujak)\b/i

const RR_TOKEN_END =
  /(?:seu|teu|teun|peu|neu|oeo|lleu|beul|keul|reul|jeu|aseu|bereu|onteu|rollang|beullaim|teumoeo)$/i

function looksLikeBrokenRomanization(name) {
  const n = name.trim()
  if (!n) return false
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.some((part, i) => i > 0 && part.toLowerCase() === parts[i - 1].toLowerCase())) {
    return true
  }
  const euTokens = parts.filter((part) => /eu$/i.test(part)).length
  if (euTokens >= 2) return true
  if (parts.length === 1 && RR_TOKEN_END.test(parts[0])) return true
  if (parts.length >= 2 && parts.some((part) => RR_TOKEN_END.test(part))) return true
  return false
}

function looksLikeLatinPersonalName(name) {
  const n = name.trim()
  if (!n) return false
  if (/[\uac00-\ud7af]/.test(n)) return false
  if (!/^[A-Za-zÀ-ÿ\s.'’\-]+$/.test(n)) return false
  if (EPITHET.test(n)) return false
  if (/['']s\b/i.test(n)) return false
  if (n.split(/\s+/).length > 4) return false
  return true
}

function scoreLatinName(name) {
  let score = 0
  if (!looksLikeBrokenRomanization(name)) score += 50
  const words = name.trim().split(/\s+/).length
  if (words >= 1 && words <= 3) score += 20
  if (/^[A-Z]/.test(name)) score += 2
  score += Math.min(name.length, 24)
  return score
}

function bestUnusedLatinAlt(full, alternatives) {
  const latinAlts = alternatives
    .map((a) => String(a).trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter(looksLikeLatinPersonalName)
    .filter((a) => a.toLowerCase() !== full.toLowerCase())
  if (latinAlts.length === 0) return null
  return latinAlts.sort((a, b) => scoreLatinName(b) - scoreLatinName(a))[0]
}

const pool = JSON.parse(await readFile(DATA, 'utf8'))

let totalCharacters = 0
let missingFull = 0
const stillBroken = []
const brokenWithFixableAlt = []
const suspiciousFull = [] // full looks like epithet
const doubleSpaces = []

for (const manhwa of pool) {
  const title = manhwa.title?.english || manhwa.title?.romaji || `#${manhwa.id}`
  for (const character of manhwa.characters || []) {
    totalCharacters++
    const full = character.name?.full?.trim() || null
    const alternatives = Array.isArray(character.name?.alternative)
      ? character.name.alternative
      : []

    if (!full) {
      missingFull++
      continue
    }

    if (/\s{2,}/.test(full)) {
      doubleSpaces.push({
        manhwaId: manhwa.id,
        title,
        characterId: character.id,
        full,
      })
    }

    if (EPITHET.test(full) || /['']s\b/i.test(full)) {
      suspiciousFull.push({
        manhwaId: manhwa.id,
        title,
        characterId: character.id,
        full,
        alternatives: alternatives.slice(0, 5),
      })
    }

    if (looksLikeBrokenRomanization(full)) {
      const fix = bestUnusedLatinAlt(full, alternatives)
      const entry = {
        manhwaId: manhwa.id,
        title,
        characterId: character.id,
        full,
        native: character.name?.native || null,
        alternatives: alternatives.slice(0, 8),
        suggestedFix: fix,
      }
      stillBroken.push(entry)
      if (fix) brokenWithFixableAlt.push(entry)
    }
  }
}

const report = {
  totals: {
    titles: pool.length,
    characters: totalCharacters,
    missingFull,
    stillBrokenRomanization: stillBroken.length,
    brokenButFixableViaAlt: brokenWithFixableAlt.length,
    suspiciousEpithetFull: suspiciousFull.length,
    doubleSpaces: doubleSpaces.length,
  },
  stillBroken: stillBroken.slice(0, 100),
  brokenWithFixableAlt,
  suspiciousFull: suspiciousFull.slice(0, 50),
  doubleSpaces,
}

await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report.totals, null, 2))
console.log('\n--- still broken (all) ---')
for (const row of stillBroken) {
  console.log(
    `${row.title} | #${row.characterId} | ${row.full} | altFix=${row.suggestedFix || 'NONE'} | alts=${(row.alternatives || []).join(' / ')}`,
  )
}
console.log('\n--- suspicious epithet full (sample) ---')
for (const row of suspiciousFull.slice(0, 20)) {
  console.log(`${row.title} | #${row.characterId} | ${row.full}`)
}
