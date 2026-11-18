#!/usr/bin/env node
/**
 * Local stand-in for the CI `quality` job (.github/workflows/ci.yml).
 *
 * By default it checks out a clean, detached copy of HEAD into a temp git
 * worktree, so only committed code is tested (no stray local edits, untracked
 * files, or stale node_modules), then runs every CI step in order with CI=true.
 *
 *   npm run preflight            # clean worktree of HEAD (what CI would see)
 *   npm run preflight -- --here  # current checkout, including uncommitted edits
 *   npm run preflight -- --skip-e2e
 *
 * Exits non-zero on the first failing step and prints a summary either way.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = new Set(process.argv.slice(2))
const here = args.has('--here')
const skipE2e = args.has('--skip-e2e')
const repoRoot = resolve(import.meta.dirname, '..')

/** Mirrors the `quality` job steps in .github/workflows/ci.yml. */
const STEPS = [
  ['Install', 'npm ci'],
  ['Secret scan', 'npm run check:secrets'],
  ['Migration timestamp uniqueness', 'npm run check:migrations'],
  ['Lint', 'npm run lint'],
  ['Unit tests', 'npm test'],
  ['Production build', 'npm run build'],
  ['Dist artifact + budget checks', 'npm run check:dist'],
  ['Playwright critical paths', 'npm run test:e2e'],
]

function git(cwd, ...gitArgs) {
  const res = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(`git ${gitArgs.join(' ')} failed:\n${res.stderr}`)
  }
  return res.stdout.trim()
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

const wantedNode = readFileSync(join(repoRoot, '.nvmrc'), 'utf8').trim()
const actualNode = process.versions.node
const nodeMatches = actualNode.split('.')[0] === wantedNode.split('.')[0]

const sha = git(repoRoot, 'rev-parse', '--short', 'HEAD')
const branch = git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD')
const dirty = git(repoRoot, 'status', '--porcelain', '--untracked-files=no') !== ''

let workDir = repoRoot
let worktreeDir = null
if (!here) {
  worktreeDir = mkdtempSync(join(tmpdir(), 'manhwadle-preflight-'))
  git(repoRoot, 'worktree', 'add', '--detach', worktreeDir, 'HEAD')
  workDir = worktreeDir
}

console.log(`\nPreflight for ${branch} @ ${sha}`)
console.log(
  here
    ? `Mode: current checkout${dirty ? ' (includes uncommitted edits)' : ''}`
    : `Mode: clean worktree of HEAD (${worktreeDir})${dirty ? '; uncommitted edits are NOT tested' : ''}`,
)
if (!nodeMatches) {
  console.log(
    `Warning: Node ${actualNode} differs from .nvmrc (${wantedNode}); CI uses ${wantedNode}.`,
  )
}

const results = []
let failed = false
try {
  for (const [name, command] of STEPS) {
    if (skipE2e && command === 'npm run test:e2e') {
      results.push({ name, status: 'skipped', ms: 0 })
      continue
    }
    console.log(`\n=== ${name}: ${command}`)
    const started = Date.now()
    const res = spawnSync(command, {
      cwd: workDir,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' },
    })
    const ms = Date.now() - started
    const ok = res.status === 0
    results.push({ name, status: ok ? 'passed' : 'FAILED', ms })
    if (!ok) {
      failed = true
      break
    }
  }
} finally {
  if (worktreeDir) {
    try {
      git(repoRoot, 'worktree', 'remove', '--force', worktreeDir)
    } catch {
      rmSync(worktreeDir, { recursive: true, force: true })
      spawnSync('git', ['worktree', 'prune'], { cwd: repoRoot })
    }
  }
}

const ran = new Set(results.map((r) => r.name))
for (const [name] of STEPS) {
  if (!ran.has(name)) results.push({ name, status: 'not run', ms: 0 })
}

console.log(`\nPreflight summary for ${branch} @ ${sha}`)
for (const r of results) {
  console.log(`  ${r.status.padEnd(8)} ${r.name}${r.ms ? ` (${formatSeconds(r.ms)})` : ''}`)
}
const verdict = failed
  ? 'FAILED'
  : skipE2e
    ? 'PASSED (e2e skipped)'
    : 'PASSED: matches the CI quality job'
console.log(`\nResult: ${verdict}${nodeMatches ? '' : ` [Node ${actualNode}, CI uses ${wantedNode}]`}\n`)
process.exit(failed ? 1 : 0)
