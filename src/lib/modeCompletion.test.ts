import { describe, expect, it } from 'vitest'
import { listModes } from '../modes'
import { buildModeRowStatuses, statusLabel } from './modeCompletion'

describe('mode registry metadata', () => {
  it('exposes description, presentation, and availability for every mode', () => {
    const modes = listModes()
    expect(modes).toHaveLength(4)
    for (const mode of modes) {
      expect(mode.description.length).toBeGreaterThan(10)
      expect(mode.presentationKey).toBe(mode.id)
      expect(mode.availability.requiredForAllMode).toBe(true)
      expect(mode.availability.defaultAvailable).toBe(true)
      expect(mode.availability.leaderboardEligible).toBe(true)
    }
  })
})

describe('buildModeRowStatuses', () => {
  it('prefers server verified completions when present', () => {
    const rows = buildModeRowStatuses({
      taste: null,
      serverModes: ['summary', 'cover'],
    })
    expect(rows.find((r) => r.modeId === 'summary')?.status).toBe('completed')
    expect(rows.find((r) => r.modeId === 'character')?.status).toBe('not_started')
    expect(rows.find((r) => r.modeId === 'summary')?.source).toBe('server')
  })

  it('marks unavailable modes from site status', () => {
    const rows = buildModeRowStatuses({
      taste: 'both',
      serverModes: [],
      unavailableModes: ['heardle'],
    })
    expect(rows.find((r) => r.modeId === 'heardle')?.status).toBe('unavailable')
    expect(statusLabel('unavailable')).toBe('Unavailable')
  })
})
