/**
 * Parse and normalize English platform/publisher from AniList description
 * `(Source: …)` tags.
 */

const UNKNOWN = 'Unknown'

/**
 * @param {string} raw
 * @returns {string}
 */
export function canonicalizePublisher(raw) {
  let s = String(raw || '')
    .replace(/,?\s*edited/i, '')
    .replace(/,?\s*translated/i, '')
    .trim()
  if (!s) return UNKNOWN

  const lower = s.toLowerCase()

  if (/webtoon/.test(lower) && !/daum/.test(lower)) return 'WEBTOON'
  if (/tapas/.test(lower)) return 'Tapas'
  if (/tappytoon/.test(lower)) return 'Tappytoon'
  if (/lezhin/.test(lower)) return 'Lezhin'
  if (/manta/.test(lower)) return 'Manta'
  if (/kakao/.test(lower)) return 'KakaoPage'
  if (/^naver/.test(lower) || lower === 'naver series') return 'Naver'
  if (/pocket\s*comic/.test(lower)) return 'Pocket Comics'
  if (/toomics/.test(lower)) return 'Toomics'
  if (/yen press/.test(lower)) return 'Yen Press'
  if (/seven seas/.test(lower)) return 'Seven Seas'
  if (/netcomic/.test(lower)) return 'Netcomics'
  if (/toptoon/.test(lower)) return 'TOPTOON'
  if (/ablaze/.test(lower)) return 'ABLAZE'
  if (/copin/.test(lower)) return 'Copin'
  if (/ize press/.test(lower)) return 'Ize Press'
  if (/ylab/.test(lower)) return 'YLAB'
  if (/boom manga/.test(lower)) return 'Boom Manga'
  if (/webnovel/.test(lower)) return 'Webnovel'
  if (/dark horse/.test(lower)) return 'Dark Horse'
  if (/infinity studios/.test(lower)) return 'Infinity Studios'
  if (/comico/.test(lower)) return 'Comico'
  if (/daum/.test(lower)) return 'Daum'

  // Title-case leftover single tokens; keep multi-word as trimmed original casing cleanup
  return s.replace(/\s+/g, ' ')
}

/**
 * @param {string | null | undefined} description
 * @returns {string}
 */
export function parsePublisher(description) {
  const desc = String(description || '')
  const match = desc.match(/\(Source:\s*([^)]+)\)/i)
  if (!match) return UNKNOWN

  const firstPart = match[1].split(/[\/&]/)[0]
  return canonicalizePublisher(firstPart)
}
