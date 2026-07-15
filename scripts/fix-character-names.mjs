/**
 * One-shot: rewrite garbled AniList character `full` names in manhwa.json
 * using Latin alternatives (e.g. Areusen… → Arsene Rostov).
 *
 * Conservative: leaves normal Korean names (Jin-U Seong) alone.
 *
 * Usage: node scripts/fix-character-names.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data', 'manhwa.json')

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

function pickPreferred(full, alternatives) {
  const trimmedFull = full?.trim() || null
  const alts = alternatives.map((a) => String(a).trim()).filter(Boolean)
  const latinAlts = alts.filter(looksLikeLatinPersonalName)
  if (!trimmedFull) {
    return latinAlts.sort((a, b) => scoreLatinName(b) - scoreLatinName(a))[0] || null
  }
  if (!looksLikeBrokenRomanization(trimmedFull)) return trimmedFull
  const bestAlt = latinAlts
    .filter((a) => a.toLowerCase() !== trimmedFull.toLowerCase())
    .sort((a, b) => scoreLatinName(b) - scoreLatinName(a))[0]
  return bestAlt || trimmedFull
}

const pool = JSON.parse(await readFile(DATA, 'utf8'))
let rewritten = 0
const samples = []

for (const manhwa of pool) {
  for (const character of manhwa.characters || []) {
    const originalFull = character.name?.full?.trim() || null
    const alternatives = Array.isArray(character.name?.alternative)
      ? character.name.alternative.map((a) => String(a).trim()).filter(Boolean)
      : []
    const preferred = pickPreferred(originalFull, alternatives)
    if (!preferred || preferred === originalFull) continue

    const nextAlts = [...alternatives]
    if (originalFull && !nextAlts.some((a) => a.toLowerCase() === originalFull.toLowerCase())) {
      nextAlts.push(originalFull)
    }
    character.name.full = preferred
    character.name.alternative = nextAlts.filter(
      (a) => a.toLowerCase() !== preferred.toLowerCase(),
    )
    rewritten++
    if (samples.length < 30) {
      samples.push({
        title: manhwa.title?.english || manhwa.title?.romaji,
        from: originalFull,
        to: preferred,
      })
    }
  }
}

await writeFile(DATA, `${JSON.stringify(pool, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ rewritten, samples }, null, 2))
