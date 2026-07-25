import { describe, expect, it } from 'vitest'
import {
  highlightTitleMatches,
  looseSearchKey,
  normalizeSearchKey,
  scoreSearchKey,
  searchTokens,
} from './nameMatch'

describe('normalizeSearchKey', () => {
  it('keeps Hangul after NFKD instead of stripping decomposed jamo', () => {
    expect(normalizeSearchKey('낙향문사전')).not.toBe('')
    expect(normalizeSearchKey('낙향문사전')).toBe(normalizeSearchKey('낙향문사전'))
    expect(scoreSearchKey('낙향문사전', normalizeSearchKey('낙향문사전'))).toBe(0)
  })

  it('still strips Latin diacritics and punctuation', () => {
    expect(normalizeSearchKey("Doctor's Rebirth")).toBe('doctorsrebirth')
    expect(normalizeSearchKey('Café')).toBe('cafe')
    expect(normalizeSearchKey('Solo Leveling')).toBe('sololeveling')
  })

  it('keeps Thai script used in AniList synonyms', () => {
    expect(normalizeSearchKey('นักเขียนตำราผู้สอบตก')).not.toBe('')
  })
})

describe('loose / token matching', () => {
  it('drops English stop words from the loose compact key', () => {
    expect(looseSearchKey('Tale of a Scribe Who Retires to the Countryside')).toBe(
      looseSearchKey('Tale of the Scribe Who Retires to the Countryside'),
    )
    expect(searchTokens('Tale of a Scribe')).toEqual(['tale', 'scribe'])
  })

  it('scores stop-word drift as an exact loose match', () => {
    const name = 'Tale of a Scribe Who Retires to the Countryside'
    const query = 'Tale of the scribe who retires to the countryside'
    expect(
      scoreSearchKey(name, normalizeSearchKey(query), {
        looseQueryKey: looseSearchKey(query),
        queryTokens: searchTokens(query),
      }),
    ).toBe(0)
  })

  it('scores unordered significant tokens below contiguous hits', () => {
    const name = 'Tale of a Scribe Who Retires to the Countryside'
    expect(
      scoreSearchKey(name, normalizeSearchKey('scribe countryside'), {
        looseQueryKey: looseSearchKey('scribe countryside'),
        queryTokens: searchTokens('scribe countryside'),
      }),
    ).toBe(3)
  })
})

describe('highlightTitleMatches', () => {
  it('highlights a compact title prefix', () => {
    expect(highlightTitleMatches('Solo Leveling', 'solo')).toEqual([
      { text: 'Solo', matched: true },
      { text: ' Leveling', matched: false },
    ])
  })

  it('highlights matching title words for token queries', () => {
    const segs = highlightTitleMatches(
      'Tale of a Scribe Who Retires to the Countryside',
      'scribe countryside',
    )
    const matched = segs.filter((s) => s.matched).map((s) => s.text)
    expect(matched).toEqual(['Scribe', 'Countryside'])
  })
})
