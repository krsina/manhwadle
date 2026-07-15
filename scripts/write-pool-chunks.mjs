import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(await readFile(join(__dirname, 'puzzle-pools.json'), 'utf8'))
const outDir = join(__dirname, 'pool-chunks')
await mkdir(outDir, { recursive: true })

const chunkSize = 400
let n = 0
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize)
  const values = chunk
    .map((r) => {
      const meta =
        r.meta == null
          ? 'null'
          : `'${JSON.stringify(r.meta).replace(/'/g, "''")}'::jsonb`
      return `('${r.mode}','${r.taste}',${r.position},${r.manhwa_id},null,${meta})`
    })
    .join(',\n')
  const prefix = n === 0 ? 'truncate public.puzzle_pool_entries;\n' : ''
  const sql = `${prefix}insert into public.puzzle_pool_entries (mode, taste, position, manhwa_id, character_id, meta) values\n${values};`
  await writeFile(join(outDir, `${String(n).padStart(2, '0')}.sql`), sql)
  n += 1
}
console.log(`Wrote ${n} chunks`)
