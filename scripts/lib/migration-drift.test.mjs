import { describe, expect, it } from 'vitest'
import {
  compareMigrationVersions,
  formatDriftReport,
  listLocalMigrationVersions,
  migrationVersionFromFilename,
  redactSecrets,
  remoteVersionsFromMigrationList,
} from './migration-drift.mjs'

describe('migrationVersionFromFilename', () => {
  it('extracts the 14-digit stamp from sql filenames', () => {
    expect(
      migrationVersionFromFilename('20260718110000_avatar_shop_economy.sql'),
    ).toBe('20260718110000')
    expect(migrationVersionFromFilename('bad.sql')).toBeNull()
    expect(migrationVersionFromFilename('notes.md')).toBeNull()
  })
})

describe('listLocalMigrationVersions', () => {
  it('collects unique sorted versions and reports invalid names', () => {
    const { versions, invalid } = listLocalMigrationVersions([
      '20260718110000_avatar_shop_economy.sql',
      'README.md',
      'not-a-stamp.sql',
      '20260718140000_whole_character_avatar_shop.sql',
      '20260718110000_dup.sql',
    ])
    expect(versions).toEqual(['20260718110000', '20260718140000'])
    expect(invalid).toEqual(['not-a-stamp.sql'])
  })
})

describe('remoteVersionsFromMigrationList', () => {
  it('reads non-empty remote versions from CLI JSON', () => {
    const versions = remoteVersionsFromMigrationList({
      migrations: [
        { local: '20260718110000', remote: '20260718110000' },
        { local: '20260718111341', remote: '' },
        { local: '', remote: '20260718111552' },
        { local: '20260718120000', remote: '20260718120000' },
      ],
      message: 'Migrations listed',
    })
    expect(versions).toEqual([
      '20260718110000',
      '20260718111552',
      '20260718120000',
    ])
  })

  it('rejects unexpected payloads', () => {
    expect(() => remoteVersionsFromMigrationList({})).toThrow(/migrations array/)
    expect(() =>
      remoteVersionsFromMigrationList({
        migrations: [{ remote: 'not-a-version' }],
      }),
    ).toThrow(/Unexpected remote/)
  })
})

describe('compareMigrationVersions', () => {
  it('reports local-only and remote-only drift', () => {
    const result = compareMigrationVersions(
      ['20260718110000', '20260718111341', '20260718120000'],
      ['20260718110000', '20260718111552', '20260718120000'],
    )
    expect(result.inSync).toBe(false)
    expect(result.matched).toEqual(['20260718110000', '20260718120000'])
    expect(result.localOnly).toEqual(['20260718111341'])
    expect(result.remoteOnly).toEqual(['20260718111552'])
  })

  it('is in sync when sets match', () => {
    const result = compareMigrationVersions(
      ['20260718110000', '20260718120000'],
      ['20260718120000', '20260718110000'],
    )
    expect(result.inSync).toBe(true)
    expect(result.localOnly).toEqual([])
    expect(result.remoteOnly).toEqual([])
  })
})

describe('formatDriftReport + redactSecrets', () => {
  it('formats a drift summary without inventing sync when drifted', () => {
    const report = formatDriftReport(
      compareMigrationVersions(['1'.padStart(14, '0')], ['2'.padStart(14, '0')]),
      { projectHint: 'demo' },
    )
    expect(report).toContain('DRIFT')
    expect(report).toContain('demo')
    expect(report).toContain('migration-drift.md')
  })

  it('redacts connection strings, JWTs, and password flags', () => {
    const raw =
      'fail postgres://user:s3cret@db.example.com:5432/postgres --db-url postgres://x --password hunter2 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb'
    const cleaned = redactSecrets(raw, ['s3cret-token-value'])
    expect(cleaned).not.toContain('s3cret@')
    expect(cleaned).not.toContain('hunter2')
    expect(cleaned).not.toContain('eyJhbGci')
    expect(cleaned).toContain('postgres://***')
    expect(cleaned).toContain('--db-url ***')
    expect(cleaned).toContain('--password ***')
    expect(cleaned).toContain('[redacted-jwt]')
  })
})
