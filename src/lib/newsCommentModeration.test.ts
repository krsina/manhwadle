import { describe, expect, it } from 'vitest'
import {
  classifyNewsCommentBody,
  normalizeNewsCommentBody,
  preflightNewsComment,
} from './newsCommentModeration'

describe('news comment moderation', () => {
  it('allows ordinary discussion and common false-positive substrings', () => {
    for (const body of [
      'Loved this update. Thanks for shipping it!',
      'The class assignment covers Scunthorpe history.',
      'This boss fight was damn difficult.',
    ]) {
      expect(classifyNewsCommentBody(body)).toMatchObject({ action: 'allow' })
      expect(preflightNewsComment(body)).toEqual({ ok: true })
    }
  })

  it('normalizes casing and whitespace consistently', () => {
    expect(normalizeNewsCommentBody('  Hello\n\tWORLD  ')).toBe('hello world')
  })

  it('rejects link, character, word, and control-character floods', () => {
    const cases = [
      'https://one.example.com www.two.example.com',
      'aaaaaaaaaaaaaa',
      'buy now buy now buy now buy now',
      `hello\u0000world`,
    ]
    for (const body of cases) {
      expect(classifyNewsCommentBody(body).action).toBe('reject')
      expect(preflightNewsComment(body)).toEqual({ ok: false, error: 'spam_rejected' })
    }
  })

  it('quarantines links and potentially dangerous content without client rejection', () => {
    for (const body of [
      'My longer review: https://example.com/review',
      'You should kill yourself',
      'I will hurt you',
      'Click here for the offer',
    ]) {
      expect(classifyNewsCommentBody(body).action).toBe('quarantine')
      expect(preflightNewsComment(body)).toEqual({ ok: true })
    }
  })

  it('enforces empty and maximum-length boundaries', () => {
    expect(preflightNewsComment('   ')).toEqual({ ok: false, error: 'body_required' })
    expect(preflightNewsComment('x'.repeat(1001))).toEqual({
      ok: false,
      error: 'body_too_long',
    })
    expect(preflightNewsComment('abcdefghij'.repeat(100))).toEqual({ ok: true })
  })
})
