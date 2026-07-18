/**
 * Fail prelaunch when public contact placeholder is still the default.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const contactPath = path.join(root, 'src/lib/siteContact.ts')

const source = fs.readFileSync(contactPath, 'utf8')
if (source.includes('CONTACT_EMAIL_PLACEHOLDER') || source.includes('TODO_CONFIGURE_CONTACT')) {
  console.error(
    'Prelaunch check failed: configure src/lib/siteContact.ts with a real contact address before launch.',
  )
  process.exit(1)
}

console.log('Contact configuration check passed')
