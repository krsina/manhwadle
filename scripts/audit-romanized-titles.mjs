/**
 * Find manhwa whose display/english title is Korean romanization
 * (e.g. "Agui Deunggyo") and propose English replacements from synonyms.
 *
 * Usage: node scripts/audit-romanized-titles.mjs
 * Optional: node scripts/audit-romanized-titles.mjs --apply
 *   Applies proposed english renames into src/data/manhwa.json
 *   (keeps old title as a synonym).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'src', 'data', 'manhwa.json')
const OUT = join(ROOT, 'scripts', 'romanized-title-audit.json')
const APPLY = process.argv.includes('--apply')

function hasHangul(s) {
  return /[\uac00-\ud7af]/.test(s || '')
}
function hasCJK(s) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(s || '')
}

/** Titles that are already English-style (skip unless mixed with KR morphs). */
const CLEARLY_ENGLISH =
  /^(I |I'm |I’ll |I'll |I’ve |I've |Am I |The |A |An |My |How |Why |What |Who |When |Where |So |They |This |That |We |You |He |She |It |No |Not |Don't |Father|Mother|Mom|Dad|Forget|Perfect|Terror|Reawakened|Neon |Mr\. |Miss |Ms\. |Dr\. |Lady |Secret |Sweet |Wind |Study |Jungle |Dungeon |Return |Villain |Ending |Orange |Cheese |Bad |God of |King'?s |Yongsa High|Relationship |Twilight |Mosquito |Mom,|So I |They Say|Father,|Forget |Happily |Talented |Someone |Psychopath |Infinite |Reincarnated |Dungeons )/i

/**
 * Korean RR morphs / title fragments that almost never appear as English.
 * Avoid short tokens like "na", "ui", "beop" that false-positive.
 */
const KR_MORPH =
  /\b(eui|eun|neun|reul|leul|euro|eseo|hago|hamkke|doen|doeneun|haneun|ibnida|hamnida|haenneunde|haetdeon|buteo|kkaji|cheoreom|gateun|igeos|geudeul|nomu|jeil|ttaemun|iyuro|saraganeun|doraon|gwihwan|ipdae|jeonnari|jeonnarida|gisawang|gisawangnim|singwa|agui|deunggyo|akdang|ilsin|hyujae|appaga|kangham|gogyo|deonjeon|gongryak|hwasan|jeonsaeng|hwansaeng|changcheon|cheonma|cheongeom|cheonha|cheongchun|dosagang|dwikkeut|eoneunal|eoreum|goedame|gureumi|haksageom|hwangjeui|hwasangwon|igeosi|beobida|ilsinsang|jeonsaengja|jibi|magye|mallyeon|manggem|mawang|nakyang|namgung|nappeun|neoman|ropan|saranghaneun|suyo|yeonghwa|yeopjari|yongwang|yuhogui|bangnang|cheojae|sesangeul|murimeul|busuda|tteoreojyeodo|chulgeune|haeya|haneunguna|piwonaen|kkot|mangnae|gongja|siche|jumneun|cheonjae|donghwa|meokneun|seojanim|seobu|buhwalhanda|jadongsanyang|munsajeon|ingneunja|saranamgi|jonjae|choegang|realida|jjakkkung|bimil|doeeotseumnida|gisul|daesahyeong|gihyeop|yesirok|ikda|gapjagi|sigyet|baneureul|doedollin|sayeon|geomsul|cheonjaega|doeeotda|yakppari|sinseonham|misughan|pyohyeon|ichawon|yongbyeong|junggan|sokkup|chinguga|doeeossda|gunju|ssisega|sihanbu|gunggwigeomsin|tarakagetseumnida|jipchakaneun|akdangi|silnun|agyeok|aneun|juingongdeul|haenguneun|mallebida|boindan|mariya|neoreul|igigo|sipeo|meomun|segye|saneun|gamunui|jjakkkungui|chef-ga|hwangjega|sigyetbaneureul|chulgeuneul|seoul-eun|webtoon-ui|kang-rim|lord-ro|boss-ui|sokkupchinguga|academy-ui|survival-ro|ropaneseo|naman|oroji|widaehan|hero-ga|cheon-ma|jukji|anneun|honja|baekssisega|hwangjewa|manggemui|sichejumneun|cheonjaejeonsa|mawangeul|wihan|mugi|yongwangnimui|hwasangwonma|dosagangho|changcheonmusin|cheongeomgihyeop|cheongchungyesirok|dwikkeutjangnyeol|eoreumgunju|haksageomjeon|hwasanjeonsaeng|jeonsaengja|mallyeonyongsa|murimseobu|nakyangmunsajeon|yuhogui)\b/i

const ENG_CONTENT =
  /\b(the|of|a|an|and|in|to|for|from|with|my|your|his|her|i|am|is|are|was|be|into|on|at|by|or|as|me|you|he|she|we|they|this|that|who|what|when|where|why|how|not|no|all|every|after|before|again|once|more|than|just|only|new|old|first|second|last|another|return|returns|returned|school|days|day|devil|god|gods|solo|leveling|hunter|hunters|tower|martial|demon|demons|sword|king|queen|world|life|death|man|men|woman|women|girl|girls|boy|boys|love|blood|shadow|dark|light|system|player|players|game|class|rank|hero|heroes|villain|villains|magic|mage|knight|dragon|beast|monster|empire|kingdom|academy|student|teacher|doctor|story|tale|legend|war|wars|battle|fight|born|became|become|reincarnated|regression|regress|max|level|up|down|back|start|end|begin|beginning|ending|chronicles|saga|over|under|reborn|rebirth|reincarnation|strongest|weakest|strong|weak|father|dad|mother|mom|son|daughter|brother|sister|family|master|disciple|sect|cult|immortal|absolute|infinite|boundless|necromancer|assassin|archer|warrior|raid|dungeon|dungeons|gate|apocalypse|survival|surviving|live|living|kill|killer|dead|deadly|ghost|spirit|soul|heaven|hell|earth|moon|sun|star|night|morning|secret|lady|lord|duke|emperor|empress|princess|prince|noble|breaker|gamer|boxer|home|sweet|nano|machine|juice|jungle|reset|memorize|taming|reverse|maker|cheese|trap|season|login|newbie|soldier|tyrant|husband|wife|marriage|married|seduce|pregnant|woke|dream|health|wealth|choose|failed|oust|fell|harem|stronger|eat|raised|black|shall|stan|stole|ranker|tamed|thought|tricked|fake|cinderella|poison|ugly|duckling|marry|save|damned|part|timer|destined|greatness|heroine|talent|talented|girlfriend|secretary|proposed|villainess|debt|bittersweet|couple|tender|heart|maid|sorcerer|doting|evil|male|lead|belong|house|see|keep|main|amy|out|quit|surgeon|terror|reawakened|neon|revenge|perfect|forget|make|money|regressor|real|one|wandering|manual|survive|heavenly|revelation|youth|grand|thousand|techniques|greatest|senior|unparalleled|genius|sees|through|reads|destroys|lich|fighter|grave|suddenly|seoul|ice|reverses|time|dropped|still|gotta|work|flower|bloomed|cloud|enlistment|records|swordsman|scholar|obsessed|obsesses|fist|mount|hua|volcanic|age|medical|creator|hiatus|break|personal|reasons|past|fox|eyed|veteran|corpse|picking|broken|picture|book|satan|fairytale|illegitimate|devours|weapons|wild|west|resurrection|auto|hunting|only|hunt|scribe|retires|countryside|youngest|clan|person|guy|surviving|romance|fantasy|novel|beloved|existence|returned|survivor|movies|are|partner|next|classmate|high|department|chef|skill|lure|crimson|lee|seob|law|happily|ever|afterwards|artifacts|baby|squirrel|reinforced|wooden|stick|psychopath|someone|else|comic|innocence|space|cosmic|fitness|trainer|simulation|rpg|log|mosquito|never|die|extra|character|webtoon|modern|transmigrated|got|fall|into|fox|eyed)\b/gi

const NON_ENGLISH_LANG =
  /\b(el|la|los|las|del|una|les|des|du|uma|aku|tidak|yang|dengan|untuk|saya|jadi|menjadi|kelahiran|putri|raja|yo|soy|esta|vida|serei|nesta|pardon|maman|watashi|unsere|einer|geschichten|hasta|que|nos|separe|ayah|mau|menikah|comment|calmer|mon|duc|impuissant|remonta|temps|wer|ist|hier|aschenputtel|moi|fille|roi|hanımefendi|bebek|eines|tages|revelaciones|juventud)\b/i

function rrVowelCount(s) {
  // Avoid English-common digraphs wa/wo/ya/yo/yu — focus on Korean RR markers
  return (s.match(/eo|eu|ae|oe|ui|yeo/gi) || []).length
}

function engHitCount(t) {
  return (t.match(ENG_CONTENT) || []).length
}

function looksLikeKoreanRomanization(title) {
  if (!title) return false
  const t = title.trim()
  if (!t || hasHangul(t) || hasCJK(t)) return false

  const engHits = engHitCount(t)
  const hasKrMorph = KR_MORPH.test(t)

  // Pure English titles stay as-is
  if (CLEARLY_ENGLISH.test(t) && !hasKrMorph) return false
  // Mostly-English titles (e.g. Infinite Leveling: Murim) stay as-is
  if (engHits >= 2 && !hasKrMorph) return false
  // English + Korean loanword still mostly English if heavily English
  if (engHits >= 3) return false

  const words = t
    .split(/[\s:\-–,+/&]+/)
    .map((w) => w.trim())
    .filter((w) => w && w !== '&')
  const rr = rrVowelCount(t)

  // Glued Revised-Romanization compounds (Namgungsega, Mangnaegongja, …).
  // Check per-token so compacting "House Garnet" cannot invent a false "sega".
  const gluedRe =
    /(gongja|gyeongchal|deunggyo|jeonsaeng|hwansaeng|munsajeon|yeonghwa|realida|baeksu|mujik|mangnae|namgung|geomsin|segyeeseo|chakage|salja|gwontusa|norigam|(?:namgung|baekssi|ssi)?sega)/i
  if (words.some((w) => gluedRe.test(w.replace(/['\-!,.?&:]+/g, '')))) {
    return true
  }

  // Korean morph present, and not dominated by English wording
  if (hasKrMorph && engHits <= 2) return true

  // Single compound romanization: Hwasanjeonsaeng, Changcheonmusin, Hwasangwonma
  if (words.length === 1) {
    const w = words[0]
    if (
      w.length >= 8 &&
      engHits === 0 &&
      /^[A-Za-z]+$/.test(w) &&
      (rr >= 1 || /(?:ng|won|gwan|jeon|saeng|gang|cheon|hwa|geo|ryeo|nyeo|sseu)/i.test(w))
    ) {
      return true
    }
  }

  if (words.length >= 2 && engHits === 0 && rr >= 1) return true
  if (words.length >= 3 && engHits === 0 && rr >= 1) return true

  return false
}

function isLikelyEnglishTitle(s) {
  if (!s || typeof s !== 'string') return false
  const t = s.trim()
  if (!t || hasHangul(t) || hasCJK(t)) return false
  if (/[А-Яа-яЁё]/.test(t)) return false
  if (NON_ENGLISH_LANG.test(t)) return false
  if (!/^[A-Za-z0-9][\w\s:'’"\-!,.?()/]*$/u.test(t)) return false
  if (looksLikeKoreanRomanization(t)) return false
  const hits = engHitCount(t)
  const words = t.split(/\s+/).length
  return hits >= 1 || (words >= 3 && /^[A-Z]/.test(t))
}

function pickEnglishSynonym(m, current) {
  const syns = (m.synonyms || []).map((s) => String(s).trim()).filter(Boolean)
  const cur = (current || '').toLowerCase()
  const rom = (m.title?.romaji || '').toLowerCase()
  const candidates = syns.filter((s) => {
    const l = s.toLowerCase()
    if (l === cur || l === rom) return false
    return isLikelyEnglishTitle(s)
  })
  candidates.sort((a, b) => {
    const aw = engHitCount(a)
    const bw = engHitCount(b)
    if (bw !== aw) return bw - aw
    return Math.min(b.length, 60) - Math.min(a.length, 60)
  })
  return { best: candidates[0] || null, all: candidates.slice(0, 5) }
}

const pool = JSON.parse(await readFile(DATA, 'utf8'))
const hits = []

for (const m of pool) {
  const eng = (m.title?.english || '').trim()
  const rom = (m.title?.romaji || '').trim()
  const nat = (m.title?.native || '').trim()
  const display = eng || rom
  if (!looksLikeKoreanRomanization(display)) continue
  const { best, all } = pickEnglishSynonym(m, display)
  hits.push({
    id: m.id,
    current: display,
    romaji: rom || null,
    native: nat || null,
    suggested: best,
    englishAlternatives: all,
  })
}

hits.sort((a, b) => a.current.localeCompare(b.current))
const withSug = hits.filter((h) => h.suggested)
const without = hits.filter((h) => !h.suggested)

const out = {
  generatedAt: new Date().toISOString(),
  total: hits.length,
  withSuggestedEnglish: withSug.length,
  needsManualEnglish: without.length,
  proposedChanges: withSug.map((h) => ({
    id: h.id,
    from: h.current,
    to: h.suggested,
    alternatives: h.englishAlternatives.filter((a) => a !== h.suggested),
    native: h.native,
  })),
  needsManual: without.map((h) => ({
    id: h.id,
    current: h.current,
    native: h.native,
    romaji: h.romaji,
  })),
}

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n')

console.log(`TOTAL romanized titles: ${hits.length}`)
console.log(`Proposed auto-fixes:   ${withSug.length}`)
console.log(`Need manual English:   ${without.length}`)
console.log(`Wrote ${OUT}`)
console.log('\n=== PROPOSED CHANGES (from => to) ===')
for (const h of withSug) {
  const alts = h.englishAlternatives.filter((a) => a !== h.suggested)
  console.log(
    `${h.id}\t${h.current}\t=>\t${h.suggested}${alts.length ? `\t| alts: ${alts.join(' / ')}` : ''}`,
  )
}
console.log('\n=== NEEDS MANUAL (no English synonym found) ===')
for (const h of without) {
  console.log(`${h.id}\t${h.current}\t(${h.native || ''})`)
}

if (APPLY) {
  let changed = 0
  const byId = new Map(withSug.map((h) => [h.id, h]))
  for (const m of pool) {
    const hit = byId.get(m.id)
    if (!hit?.suggested) continue
    const old = (m.title?.english || m.title?.romaji || '').trim()
    if (!old || old.toLowerCase() === hit.suggested.toLowerCase()) continue
    m.title = m.title || {}
    m.title.english = hit.suggested
    const syns = Array.isArray(m.synonyms) ? m.synonyms.map(String) : []
    if (!syns.some((s) => s.toLowerCase() === old.toLowerCase())) syns.push(old)
    m.synonyms = syns
    changed++
  }
  await writeFile(DATA, JSON.stringify(pool, null, 2) + '\n')
  console.log(`\nApplied ${changed} english title renames to manhwa.json`)
}
