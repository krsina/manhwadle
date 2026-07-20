import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const modes = ['summary', 'character', 'cover', 'heardle'] as const

describe('ranked mode fail-closed contracts', () => {
  for (const mode of modes) {
    it(`${mode} suppresses local-only sync and requires clue metadata`, () => {
      const source = fs.readFileSync(
        path.resolve(`src/modes/${mode}/${mode[0]!.toUpperCase()}${mode.slice(1)}Game.tsx`),
        'utf8',
      )
      expect(source).toContain(
        'const localOnlyToday = wantsRanked && (migrationMissing || forcedLocalOnly)',
      )
      expect(source).toContain('forcedLocalOnlyRef.current = true')
      expect(source).toContain(
        'const rankedPayloadMissing = wantsRanked && !migrationMissing && !rankedClueReady',
      )
      expect(source).toContain(
        'if (localOnlyToday || forcedLocalOnlyRef.current) return',
      )
      expect(source).toMatch(
        /!localOnlyToday[\s\S]*?sync\.progress\(/,
      )
      expect(source).toContain('Ranked puzzle unavailable: the server has no clue-safe metadata')
    })
  }
})
