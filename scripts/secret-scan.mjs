/**
 * Lightweight secret pattern scan for CI (no remote mutation).
 * Fails on high-confidence accidental secret commits in tracked source.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-tools',
  '.git',
  'manhwadle-etl',
  'local-backup',
  'coverage',
  'playwright-report',
  'test-results',
])

const SKIP_FILES = /\.(png|jpe?g|gif|webp|ico|woff2?|mp3|mp4|pdf|lock)$/i

function shouldSkipFile(rel) {
  const base = path.basename(rel)
  if (base === '.env' || base.startsWith('.env.')) return true
  if (SKIP_FILES.test(base)) return true
  return false
}

const PATTERNS = [
  {
    name: 'supabase-service-role-jwt',
    re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    allow: (file, line) =>
      file.includes('.env.example') ||
      line.includes('YOUR_') ||
      line.includes('example') ||
      line.includes('placeholder'),
  },
  {
    name: 'aws-access-key',
    re: /AKIA[0-9A-Z]{16}/,
    allow: () => false,
  },
  {
    name: 'generic-private-key-block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    allow: () => false,
  },
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else {
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (!shouldSkipFile(rel)) out.push(full)
    }
  }
  return out
}

const files = walk(root)
const hits = []

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(line)) continue
      if (pattern.allow(rel, line)) continue
      hits.push(`${rel}:${i + 1} ${pattern.name}`)
    }
  }
}

if (hits.length) {
  console.error('Secret scan failed:\n' + hits.join('\n'))
  process.exit(1)
}

console.log(`Secret scan passed (${files.length} files)`)
