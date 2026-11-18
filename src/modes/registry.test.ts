import { describe, expect, it } from 'vitest'
import { getMode, listDailyModes, listFooterModes, listModes } from './registry'

describe('mode registry', () => {
  it('keeps Heardle playable but out of the daily set', () => {
    expect(getMode('heardle')).toBeDefined()
    expect(listModes().map((m) => m.id)).toContain('heardle')
    expect(listDailyModes().map((m) => m.id)).toEqual(['summary', 'character', 'cover'])
    expect(listFooterModes().map((m) => m.id)).toEqual(['heardle'])
  })

  it('only requires daily modes for the all-mode streak', () => {
    const required = listModes()
      .filter((m) => m.availability.requiredForAllMode)
      .map((m) => m.id)
    expect(required).toEqual(['summary', 'character', 'cover'])
  })
})
