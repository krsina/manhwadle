import { describe, expect, it } from 'vitest'
import { savedListDraftIssue, savedListProgress } from './savedListDraft'

describe('savedListDraftIssue', () => {
  it('points at the name field before anything else', () => {
    expect(savedListDraftIssue({ name: '   ', entryCount: 0 })).toEqual({
      field: 'name',
      message: 'Name your list before saving.',
    })
  })

  it('rejects overlong names', () => {
    const issue = savedListDraftIssue({ name: 'x'.repeat(41), entryCount: 5 })
    expect(issue?.field).toBe('name')
    expect(issue?.message).toContain('40 characters')
  })

  it('counts the titles still missing', () => {
    expect(savedListDraftIssue({ name: 'Faves', entryCount: 2 })).toEqual({
      field: 'entries',
      message: 'Pick 1 more title before saving.',
    })
    expect(savedListDraftIssue({ name: 'Faves', entryCount: 0 })?.message).toBe(
      'Pick 3 more titles before saving.',
    )
  })

  it('clears once a named draft has the minimum', () => {
    expect(savedListDraftIssue({ name: 'Faves', entryCount: 3 })).toBeNull()
  })

  it('never caps a draft at a hundred titles', () => {
    expect(savedListDraftIssue({ name: 'Everything', entryCount: 994 })).toBeNull()
  })
})

describe('savedListProgress', () => {
  it('counts down to the minimum, then reports readiness', () => {
    expect(savedListProgress(0)).toBe('3 more titles to go')
    expect(savedListProgress(2)).toBe('1 more title to go')
    expect(savedListProgress(3)).toBe('3 titles ready to save')
  })
})
