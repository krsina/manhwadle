import { readFileSync, writeFileSync } from 'node:fs'

const a = JSON.parse(readFileSync('scripts/name-order-alias-audit.json', 'utf8'))

function esc(s) {
  return `"${String(s).replace(/"/g, '""')}"`
}

const lines = ['manhwaId,title,characterId,role,isProtagonist,primaryName,orderAlias']
for (const e of a.entries) {
  lines.push(
    [e.manhwaId, esc(e.title), e.characterId, e.role, e.isProtagonist, esc(e.from), esc(e.to)].join(
      ',',
    ),
  )
}
writeFileSync('scripts/name-order-alias-audit.csv', lines.join('\n') + '\n')
console.log('csv rows', a.entries.length)
