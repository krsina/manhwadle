/**
 * Prefer readable English character names over broken AniList romanizations.
 * Example: "Areusen Roseutopeu Roseutopeu" → "Arsene Rostov" (from alternatives).
 *
 * Intentionally conservative: do not rewrite normal Korean names like "Jin-U Seong"
 * into nicknames/epithets ("World's Weakest Hunter").
 */

import { nameOrderVariants, normalizeSearchKey } from './nameMatch'

/** Role titles / epithets that should not become the primary display name. */
const EPITHET =
  /\b(bastard|dancer|hunter|emperor|poisoner|slaughterer|crew|mobster|sunfish|mad cow|king|queen|prince|princess|duke|duchess|marquis|count|baron|lady|lord|captain|boss|god|spirit|intermediate|saintess|emperor|empress|woman with|man with|gongjak|hujak)\b/i

/** Token endings common in Revised Romanization of European loanwords. */
const RR_TOKEN_END =
  /(?:seu|teu|teun|peu|neu|oeo|lleu|beul|keul|reul|jeu|aseu|bereu|onteu|rollang|beullaim|teumoeo)$/i

/** Revised-Romanization dumps of loanwords (eu endings, repeated tokens, etc.). */
export function looksLikeBrokenRomanization(name: string): boolean {
  const n = name.trim()
  if (!n) return false

  const parts = n.split(/\s+/).filter(Boolean)

  // "Roseutopeu Roseutopeu"
  if (parts.some((part, i) => i > 0 && part.toLowerCase() === parts[i - 1]!.toLowerCase())) {
    return true
  }

  // Two or more whole tokens ending in -eu (Areusen Roseutopeu…)
  const euTokens = parts.filter((part) => /eu$/i.test(part)).length
  if (euTokens >= 2) return true

  // Single-token RR loanword: Ruminaseu, Peiteun
  if (parts.length === 1 && RR_TOKEN_END.test(parts[0]!)) return true

  // Multi-word where any token looks like RR loanword dump: Belteumoeo, Idenbereu
  if (parts.length >= 2 && parts.some((part) => RR_TOKEN_END.test(part))) return true

  return false
}

export function looksLikeLatinPersonalName(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (/[\uac00-\ud7af]/.test(n)) return false
  if (!/^[\p{Script=Latin}\s.'’\-]+$/u.test(n)) return false
  if (EPITHET.test(n)) return false
  // Possessives like "World's Weakest…" — allow D'Monte / O'Brien
  if (/['']s\b/i.test(n)) return false
  if (n.split(/\s+/).length > 4) return false
  return true
}

function scoreLatinName(name: string): number {
  let score = 0
  if (!looksLikeBrokenRomanization(name)) score += 50
  // Prefer normal 1–3 word personal names
  const words = name.trim().split(/\s+/).length
  if (words >= 1 && words <= 3) score += 20
  if (/^[A-Z]/.test(name)) score += 2
  // Slight preference for longer real names over tiny nicknames
  score += Math.min(name.length, 24)
  return score
}

/** Pick the best primary display name from AniList full + alternatives. */
export function pickPreferredCharacterFull(
  full: string | null | undefined,
  alternatives: string[] = [],
): string | null {
  const trimmedFull = full?.trim().replace(/\s+/g, ' ') || null
  const alts = alternatives
    .map((a) => a.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
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

export interface CharacterNameFields {
  full: string | null
  native: string | null
  alternative: string[]
}

/** Add reversed given/family order for two-token Latin names (Seol Kang ↔ Kang Seol). */
export function withNameOrderAliases(name: CharacterNameFields): CharacterNameFields {
  const full = name.full?.trim().replace(/\s+/g, ' ') || null
  const alternatives = (name.alternative || []).map((a) => a.trim()).filter(Boolean)
  if (!full) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }

  const variants = nameOrderVariants(full)
  const swapped = variants.find(
    (variant) => normalizeSearchKey(variant) !== normalizeSearchKey(full),
  )
  if (!swapped) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }

  const swappedKey = normalizeSearchKey(swapped)
  if (alternatives.some((alt) => normalizeSearchKey(alt) === swappedKey)) {
    return { full, native: name.native?.trim() || null, alternative: alternatives }
  }

  return {
    full,
    native: name.native?.trim() || null,
    alternative: [...alternatives, swapped],
  }
}

/** Rewrite name fields so `full` is readable; keep the AniList full as an alias. */
export function normalizeCharacterNameFields(
  name: CharacterNameFields,
): CharacterNameFields {
  const originalFull = name.full?.trim() || null
  const alternatives = (name.alternative || []).map((a) => a.trim()).filter(Boolean)
  const preferred = pickPreferredCharacterFull(originalFull, alternatives)

  if (!preferred || preferred === originalFull) {
    return withNameOrderAliases({
      full: originalFull,
      native: name.native?.trim() || null,
      alternative: alternatives,
    })
  }

  const nextAlts = [...alternatives]
  if (originalFull && !nextAlts.some((a) => a.toLowerCase() === originalFull.toLowerCase())) {
    nextAlts.push(originalFull)
  }

  return withNameOrderAliases({
    full: preferred,
    native: name.native?.trim() || null,
    alternative: nextAlts.filter((a) => a.toLowerCase() !== preferred.toLowerCase()),
  })
}

export function characterDisplayName(character: {
  id: number
  name: CharacterNameFields
}): string {
  return (
    character.name.full?.trim() ||
    character.name.native?.trim() ||
    `Character #${character.id}`
  )
}
