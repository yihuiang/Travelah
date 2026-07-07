/**
 * Clean places.json:
 *  1. Remove non-Malaysian POIs (e.g. China/Taiwan/HK content that leaked in)
 *     — verified via Google: a suspect place whose real geocode is outside
 *     Malaysia is dropped.
 *  2. Tidy messy caption-style names using Google's official displayName
 *     ("TG's Bistro.Ella吃过的印度香酥塔饼…" → "TG's Bistro").
 *
 * Only touches suspects (no googleState, messy name, or foreign keyword) so
 * well-resolved Malaysian places are never at risk.
 *
 * Usage:
 *   node scripts/clean-places.mjs --dry-run          # report only
 *   node scripts/clean-places.mjs --limit=20 --dry-run
 *   node scripts/clean-places.mjs                    # apply, then re-seed
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { searchPlace } from './lib/google-places.mjs'
import { stateFromGoogleAddress } from './lib/infer-state.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesPath = path.resolve(__dirname, '../data/places.json')
const apiKey = process.env.GOOGLE_PLACES_API_KEY
const delayMs = Number(process.env.GOOGLE_PLACES_DELAY_MS || 250)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
// By default only re-check places that aren't yet Google-verified (cheap on
// re-imports). --all forces a deep re-check of every suspect.
const checkAll = args.includes('--all')

const overridesPath = path.resolve(__dirname, '../data/places-name-overrides.json')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const normKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

const FOREIGN =
  /中国|china|江西|九江|广东|揭阳|普宁|青岛|大理|丽江|三亚|厦门|北京|上海|广州|深圳|重庆|杭州|成都|西安|武汉|南京|苏州|湖南|湖北|河南|山东|四川|云南|贵州|福建|浙江|安徽|台湾|taiwan|十分车站|香港|hong\s*kong|尖沙咀|旺角|铜锣湾|上环|澳门|macau|泰国|thailand|日本|japan|韩国|korea|越南|vietnam|印尼|indonesia|柬埔寨|cambodia/i

function addressCountry(addr) {
  if (!addr) return null
  if (/malaysia/i.test(addr)) return 'MY'
  if (FOREIGN.test(addr)) return 'FOREIGN'
  return 'OTHER'
}

function isMessyName(name) {
  if (!name) return false
  if (name.length > 22) return true
  if (/吃过|薄脆|蘸|的酱|历史文化街|导航到|集合|分行|waze|klook|前一天|房源|地址/i.test(name)) return true
  // Latin venue head followed by a long CJK caption tail.
  if (/^[A-Za-z][A-Za-z0-9'&.\s-]{2,}[一-鿿]{4,}/.test(name)) return true
  return false
}

// A predominantly-Chinese name with little/no Latin — these are the ones that
// can be a foreign (China/TW/HK) POI yet still carry a false Malaysian
// googleState from the earlier ", Malaysia"-biased lookup, so re-verify them.
function isMostlyCjk(name) {
  const cjk = (name.match(/[一-鿿]/g) || []).length
  const latin = (name.match(/[A-Za-z]/g) || []).length
  return cjk >= 4 && latin <= 2
}

function isCleanerName(displayName, current) {
  if (!displayName) return false
  if (FOREIGN.test(displayName)) return false
  if (displayName.length >= current.length) return false
  if (displayName.length < 3) return false
  return true
}

async function main() {
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY in server/.env')

  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))
  // Incremental by default: only places that aren't Google-verified yet (i.e.
  // new ones from a fresh import). --all re-checks every suspect.
  let candidates = checkAll
    ? places.filter((p) => !p.googleState || isMessyName(p.name) || FOREIGN.test(p.name) || isMostlyCjk(p.name))
    : places.filter((p) => !p.googleState)
  if (limit > 0) candidates = candidates.slice(0, limit)

  console.log(`Checking ${candidates.length} suspect places (of ${places.length})…`)

  const removeIds = new Set()
  const renamed = []
  let checked = 0

  for (const place of candidates) {
    checked += 1
    try {
      const match = await searchPlace(apiKey, place.name) // bare name — reveals the true location
      const country = addressCountry(match?.formattedAddress)
      const displayName = match?.displayName?.text

      // Removal. A foreign geocode removes a place when it isn't safely a known
      // Malaysian match — i.e. it has no googleState, OR its name is mostly
      // Chinese (so a foreign hit is genuine, not a Latin-name coincidence).
      const removable = !place.googleState || isMostlyCjk(place.name)
      if (country === 'FOREIGN' && removable) {
        removeIds.add(place._id)
        console.log(`  REMOVE  ${place.name.slice(0, 30)}  →  ${match?.formattedAddress?.slice(0, 42)}`)
        continue
      }
      if (!match && FOREIGN.test(place.name) && !place.googleState) {
        removeIds.add(place._id)
        console.log(`  REMOVE  ${place.name.slice(0, 30)}  →  foreign keyword, no match`)
        continue
      }
      if (!place.googleState && country === 'MY' && match?.formattedAddress) {
        const gState = stateFromGoogleAddress(match.formattedAddress)
        if (gState) {
          place.googleState = gState
          place.state = gState
        }
      }

      // Name tidy for Malaysian places with caption-style names.
      if (!removeIds.has(place._id) && isMessyName(place.name) && country !== 'FOREIGN' && isCleanerName(displayName, place.name)) {
        renamed.push({ from: place.name, to: displayName })
        place.name = displayName
      }
    } catch (err) {
      console.log(`  error ${place.name.slice(0, 30)}: ${err.message.slice(0, 60)}`)
    }
    if (checked < candidates.length) await sleep(delayMs)
  }

  const cleaned = places.filter((p) => !removeIds.has(p._id))

  console.log(`\nRemoved ${removeIds.size} non-Malaysian places. Renamed ${renamed.length}.`)
  renamed.slice(0, 12).forEach((r) => console.log(`  rename: "${r.from.slice(0, 34)}" → "${r.to}"`))

  if (!dryRun) {
    fs.writeFileSync(placesPath, JSON.stringify(cleaned, null, 2), 'utf8')
    console.log(`\nwritten ${cleaned.length} places → ${placesPath}`)

    // Persist renames so a future re-extraction keeps the tidy names (and the
    // preserved googleState matches by the clean name) instead of reverting.
    if (renamed.length) {
      let overrides = {}
      if (fs.existsSync(overridesPath)) {
        try {
          overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
        } catch {
          overrides = {}
        }
      }
      for (const r of renamed) overrides[normKey(r.from)] = r.to
      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), 'utf8')
      console.log(`persisted ${renamed.length} name overrides → ${overridesPath}`)
    }
    console.log('Next: npm run seed:places')
  } else {
    console.log('\n(dry-run — nothing written)')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
