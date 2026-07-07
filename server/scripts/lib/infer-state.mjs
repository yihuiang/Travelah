/**
 * Malaysian state inference — shared by the import pipelines and the
 * fix-locations correction script.
 *
 * Improvements over the old first-match approach:
 *  - Word boundaries on romanized tokens (kl, kk, jb) so they no longer match
 *    inside unrelated words (e.g. "sparkling").
 *  - City/landmark patterns map to their state (Langkawi→Kedah, Genting→Pahang).
 *  - Scored best-match instead of "first state in the list wins", so a
 *    multi-state post is tagged by the strongest signal, not list order.
 *  - Google address parser for authoritative, geocoded state.
 */

// Each state with case-insensitive CJK + romanized patterns. Romanized tokens
// use \b so short abbreviations don't match substrings.
export const STATE_RULES = [
  { state: 'Penang', patterns: [/槟城|槟岛|乔治市|乔治城/, /\bpenang\b/i, /\bgeorge\s*town\b/i] },
  { state: 'Kuala Lumpur', patterns: [/吉隆坡/, /\bkuala\s*lumpur\b/i, /\bk\.?l\b/i] },
  { state: 'Putrajaya', patterns: [/布城|布特拉再也/, /\bputrajaya\b/i] },
  {
    state: 'Selangor',
    patterns: [/雪兰莪|莎阿南|八打灵|巴生|蒲种|安邦/, /\bselangor\b/i, /\bshah\s*alam\b/i, /\bpetaling\b/i, /\bsubang\b/i, /\bklang\b/i],
  },
  { state: 'Melaka', patterns: [/马六甲/, /\bmelaka\b/i, /\bmalacca\b/i] },
  { state: 'Johor', patterns: [/柔佛|新山|麻坡|笨珍/, /\bjohor\b/i, /\bjohor\s*bahru\b/i, /\bj\.?b\b/i] },
  {
    state: 'Negeri Sembilan',
    patterns: [/森美兰|芙蓉|波德申/, /\bnegeri\s*sembilan\b/i, /\bseremban\b/i, /\bport\s*dickson\b/i],
  },
  {
    state: 'Perak',
    patterns: [/霹雳|怡保|太平|邦咯|红土坎|曼绒/, /\bperak\b/i, /\bipoh\b/i, /\btaiping\b/i, /\bpangkor\b/i],
  },
  {
    state: 'Kedah',
    patterns: [/吉打|亚罗士打|兰卡威|浮罗交怡|双溪大年/, /\bkedah\b/i, /\balor\s*setar\b/i, /\blangkawi\b/i],
  },
  { state: 'Perlis', patterns: [/玻璃市|加央/, /\bperlis\b/i, /\bkangar\b/i] },
  {
    state: 'Pahang',
    patterns: [/彭亨|关丹|金马伦|云顶|劳勿|文冬|龙运/, /\bpahang\b/i, /\bkuantan\b/i, /\bcameron\b/i, /\bgenting\b/i],
  },
  {
    state: 'Terengganu',
    patterns: [
      /登嘉楼|丁加奴|瓜拉登嘉楼|瓜拉丁加奴|热浪岛|停泊岛|肯逸|龙运/,
      /\bterengganu\b/i,
      /\bredang\b/i,
      /\bperhentian\b/i,
      /\bkenyir\b/i,
      /\bkapas\b/i,
    ],
  },
  { state: 'Kelantan', patterns: [/吉兰丹|哥打巴鲁/, /\bkelantan\b/i, /\bkota\s*bharu\b/i] },
  {
    state: 'Sabah',
    patterns: [
      /沙巴|亚庇|仙本那|神山|昆达山|斗湖|山打根|环滩岛/,
      /\bsabah\b/i,
      /\bkota\s*kinabalu\b/i,
      /\bkundasang\b/i,
      /\bkinabalu\b/i,
      /\bsemporna\b/i,
      /\bk\.?k\b/i,
    ],
  },
  { state: 'Sarawak', patterns: [/砂拉越|古晋|美里|诗巫/, /\bsarawak\b/i, /\bkuching\b/i, /\bmiri\b/i] },
  { state: 'Labuan', patterns: [/纳闽岛|纳闽(?!巴霍)/, /\blabuan\b(?!\s*bajo)/i] },
]

const ALL_STATE_NAMES = STATE_RULES.map((r) => r.state)

// Field weights for scoring. The scrape keyword + location reflect search
// intent (usually right); title/description are the post's actual content.
const FIELD_WEIGHTS = { sourceKeyword: 4, location: 3, batchLabel: 3, title: 2, description: 1 }

function stateMatchesField(rule, text) {
  return rule.patterns.some((p) => p.test(text))
}

/**
 * Score every state across the weighted fields and return the strongest.
 * Falls back to the batch label, then 'Malaysia'.
 */
export function inferStateScored(fields = {}) {
  const scores = new Map()
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const text = String(fields[field] || '')
    if (!text) continue
    for (const rule of STATE_RULES) {
      if (stateMatchesField(rule, text)) {
        scores.set(rule.state, (scores.get(rule.state) || 0) + weight)
      }
    }
  }

  let best = null
  let bestScore = 0
  // Iterate STATE_RULES order so ties resolve to the earlier (more specific) state.
  for (const { state } of STATE_RULES) {
    const score = scores.get(state) || 0
    if (score > bestScore) {
      bestScore = score
      best = state
    }
  }
  if (best) return best

  const batch = String(fields.batchLabel || '').toLowerCase()
  const byBatch = ALL_STATE_NAMES.find((s) => s.toLowerCase() === batch)
  if (byBatch) return byBatch
  return 'Malaysia'
}

// ---- Google address → authoritative state ----

// Google returns Malay or English admin-area names; map them to app state names.
const GOOGLE_STATE_MAP = {
  'pulau pinang': 'Penang',
  penang: 'Penang',
  'kuala lumpur': 'Kuala Lumpur',
  'wilayah persekutuan kuala lumpur': 'Kuala Lumpur',
  'federal territory of kuala lumpur': 'Kuala Lumpur',
  putrajaya: 'Putrajaya',
  'wilayah persekutuan putrajaya': 'Putrajaya',
  labuan: 'Labuan',
  'wilayah persekutuan labuan': 'Labuan',
  selangor: 'Selangor',
  melaka: 'Melaka',
  malacca: 'Melaka',
  johor: 'Johor',
  'negeri sembilan': 'Negeri Sembilan',
  perak: 'Perak',
  kedah: 'Kedah',
  perlis: 'Perlis',
  pahang: 'Pahang',
  terengganu: 'Terengganu',
  kelantan: 'Kelantan',
  sabah: 'Sabah',
  sarawak: 'Sarawak',
}

export function normalizeStateName(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return GOOGLE_STATE_MAP[key] || null
}

/**
 * Parse the Malaysian state out of a Google `formattedAddress`, e.g.
 * "12, Lebuh Carnarvon, 10100 George Town, Pulau Pinang, Malaysia" → "Penang".
 * Scans address components from the end (state sits just before "Malaysia").
 */
export function stateFromGoogleAddress(formattedAddress) {
  if (!formattedAddress) return null
  const parts = String(formattedAddress)
    .split(',')
    .map((p) => p.replace(/\d{4,5}/g, '').trim()) // drop postcodes
    .filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const mapped = normalizeStateName(parts[i])
    if (mapped) return mapped
  }
  // Last resort: scan the whole string for any state keyword.
  for (const rule of STATE_RULES) {
    if (rule.patterns.some((p) => p.test(formattedAddress))) return rule.state
  }
  return null
}

// Hand-verified state for specific POIs whose name/text doesn't reveal the state.
export const KNOWN_PLACE_STATES = {
  kundasang: 'Sabah',
  'hounon ridge farmstay': 'Sabah',
  'zing sunset bar': 'Sabah',
  'kenyir lake': 'Terengganu',
  'tasik kenyir': 'Terengganu',
  'pulau kapas': 'Terengganu',
  'pulau redang': 'Terengganu',
  'redang bay resort': 'Terengganu',
  'lang tengah': 'Terengganu',
  'pangkor laut resort': 'Perak',
  'pulau ketam': 'Selangor',
}
