import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readRepo(relativePath: string): string {
  return fs
    .readFileSync(path.resolve(relativePath), 'utf8')
    .replace(/\r\n/g, '\n')
}

const configToml = readRepo('supabase/config.toml')
const moderationFn = readRepo('supabase/functions/moderation/index.ts')
const accountDataFn = readRepo('supabase/functions/account-data/index.ts')
const selectDailyFn = readRepo(
  'supabase/functions/select-daily-puzzles/index.ts',
)
const deploymentDoc = readRepo('docs/deployment.md')

describe('edge auth hardening contracts', () => {
  it('sets explicit verify_jwt for user JWT vs cron functions', () => {
    expect(configToml).toMatch(
      /\[functions\.account-data\]\s*\nverify_jwt = true/,
    )
    expect(configToml).toMatch(
      /\[functions\.moderation\]\s*\nverify_jwt = true/,
    )
    expect(configToml).toMatch(
      /\[functions\.select-daily-puzzles\]\s*\nverify_jwt = false/,
    )
  })

  it('derives caller identity from getUser(jwt) and rejects spoofed ids', () => {
    for (const source of [moderationFn, accountDataFn]) {
      expect(source).toContain('auth.getUser(jwt)')
      expect(source).toContain('findSpoofedCallerIdKey')
      expect(source).not.toMatch(
        /Access-Control-Allow-Origin["']\s*:\s*["']\*["']/,
      )
      expect(source).toContain('CORS_ALLOWED_ORIGINS')
    }
    expect(moderationFn).toContain('const actorId = user.id')
    expect(accountDataFn).toContain('const userId = user.id')
  })

  it('documents custom cron auth for select-daily-puzzles', () => {
    expect(selectDailyFn).toContain('CRON_SECRET')
    expect(selectDailyFn).toContain('x-cron-secret')
    expect(selectDailyFn).toContain('verify_jwt')
    expect(deploymentDoc).toContain('Leaked-password protection')
    expect(deploymentDoc).toContain('Before User Created hook')
    expect(deploymentDoc).toContain('CORS_ALLOWED_ORIGINS')
    expect(deploymentDoc).toContain('select-daily-puzzles')
    expect(deploymentDoc).toContain('verify_jwt')
  })
})
