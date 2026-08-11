export type NewsCommentFilterDecision =
  | { action: 'allow'; category: null; rule: null }
  | { action: 'reject' | 'quarantine'; category: string; rule: string }

const URL_PATTERN =
  /(?:https?:\/\/[^\s]+|www\.[^\s]+|[\p{L}\p{N}-]+\.(?:com|net|org|xyz|io)(?:\/[^\s]*)?(?=\s|$))/giu

export const NEWS_COMMENT_MAX_LENGTH = 1000

const QUARANTINE_RULES: {
  category: string
  rule: string
  pattern: RegExp
}[] = [
  {
    category: 'harassment',
    rule: 'targeted_self_harm',
    pattern: /(?:^|[^\p{L}\p{N}_])(?:kys|kill\s+yourself)(?:$|[^\p{L}\p{N}_])/iu,
  },
  {
    category: 'threat',
    rule: 'credible_threat',
    pattern:
      /(?:^|[^\p{L}\p{N}_])(?:i\s+(?:will|am\s+going\s+to)|gonna)\s+(?:kill|hurt|doxx?)(?:$|[^\p{L}\p{N}_])/iu,
  },
  {
    category: 'sexual_content',
    rule: 'explicit_solicitation',
    pattern: /(?:^|[^\p{L}\p{N}_])(?:send\s+nudes?|onlyfans|porn)(?:$|[^\p{L}\p{N}_])/iu,
  },
  {
    category: 'hate_speech',
    rule: 'severe_slur_1',
    pattern: /(?:^|[^\p{L}\p{N}_])n+[i1!]+[gq]+[e3a@]*r+s?(?:$|[^\p{L}\p{N}_])/iu,
  },
  {
    category: 'hate_speech',
    rule: 'severe_slur_2',
    pattern: /(?:^|[^\p{L}\p{N}_])f+[a@4]+[gq]+[o0]*t+s?(?:$|[^\p{L}\p{N}_])/iu,
  },
  {
    category: 'spam',
    rule: 'common_spam_pitch',
    pattern:
      /(?:^|[^\p{L}\p{N}_])(?:buy\s+cheap|free\s+(?:money|crypto)|crypto\s+giveaway|click\s+here)(?:$|[^\p{L}\p{N}_])/iu,
  },
]

export function normalizeNewsCommentBody(body: string): string {
  return body.trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

export function classifyNewsCommentBody(body: string): NewsCommentFilterDecision {
  const normalized = normalizeNewsCommentBody(body)
  const withoutAllowedWhitespace = body.replace(/[\n\r\t]/gu, '')
  const hasControlCharacter = Array.from(withoutAllowedWhitespace).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
  if (hasControlCharacter) {
    return { action: 'reject', category: 'malformed', rule: 'control_characters' }
  }

  const urlCount = normalized.match(URL_PATTERN)?.length ?? 0
  if (urlCount >= 2) {
    return { action: 'reject', category: 'spam', rule: 'excessive_links' }
  }
  if (/(\S)\1{11,}/u.test(normalized)) {
    return { action: 'reject', category: 'spam', rule: 'repeated_characters' }
  }

  const words = normalized.match(/[\p{L}\p{N}_]+/gu) ?? []
  if (words.length >= 8 && new Set(words).size <= 2) {
    return { action: 'reject', category: 'spam', rule: 'repeated_words' }
  }

  for (const candidate of QUARANTINE_RULES) {
    if (candidate.pattern.test(normalized)) {
      return {
        action: 'quarantine',
        category: candidate.category,
        rule: candidate.rule,
      }
    }
  }

  if (urlCount === 1) {
    return { action: 'quarantine', category: 'external_link', rule: 'single_external_link' }
  }
  return { action: 'allow', category: null, rule: null }
}

export function preflightNewsComment(
  body: string,
): { ok: true } | { ok: false; error: 'body_required' | 'body_too_long' | 'spam_rejected' } {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'body_required' }
  if (trimmed.length > NEWS_COMMENT_MAX_LENGTH) {
    return { ok: false, error: 'body_too_long' }
  }
  return classifyNewsCommentBody(trimmed).action === 'reject'
    ? { ok: false, error: 'spam_rejected' }
    : { ok: true }
}
