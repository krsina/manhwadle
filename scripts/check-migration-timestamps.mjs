/**
 * Fail when two migration files share the same timestamp prefix.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'supabase/migrations')

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
const stamps = new Map()

for (const file of files) {
  const stamp = file.slice(0, 14)
  if (!/^\d{14}$/.test(stamp)) {
    console.error(`Unexpected migration name: ${file}`)
    process.exit(1)
  }
  if (stamps.has(stamp)) {
    console.error(`Duplicate migration timestamp ${stamp}: ${stamps.get(stamp)} and ${file}`)
    process.exit(1)
  }
  stamps.set(stamp, file)
}

console.log(`Checked ${files.length} migrations — timestamps unique`)
