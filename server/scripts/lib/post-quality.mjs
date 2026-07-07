/**
 * Shared place/post relevance rules for NLP extraction and API filtering.
 */

const PROMO_PATTERN =
  /(?:exclusive perk|discount promotion|promotion in partnership|valid till|show room key|%\s*off|giveaway|sponsored|use (?:my |our )?code|promo code|coupon code|limited time offer|book now and|rm\d+\s*(?:off|discount)|we're thrilled to announce|special offer for|get rm\d+|rm\d+ discount|partnership with|hotel guests?!|guest perk|pakej\s+penginapan|last booking|staying period|jenis penginapan|sah sehingga|sebilik|nett\/room|\/room\/night|extra bed with breakfast|price\s*💰|add-on|buffet br|superior room|deluxe room|suite room|family room|hillview|seaview)/i

const RATE_CARD_PATTERN = /(?:RM\s*\d+).*(?:RM\s*\d+).*(?:RM\s*\d+)/i

const FESTIVAL_PATTERN =
  /(?:\bfestival\b|\bfood\s+fest\b|bon\s*odori|pop[-\s]?up\s+festival|kl\s+festival|美食市集\s*food\s+fest|(?:beer|music|light|street\s+food|dragon\s+boat)\s+festival|rainforest\s+world\s+music|yosakoi\s+parade|festival\s+wakoh|asian\s+street\s+food\s+festival|(?:啤酒|音乐|灯光|投影|文化|旅游)节|嘉年华|美食市集.*即将登陆|免费入场|活动亮点)/i

export function isFestivalPost(post) {
  if (!post) return false
  const text = [post.title, post.description, post.location, post.sourceKeyword]
    .filter(Boolean)
    .join(' ')
  return FESTIVAL_PATTERN.test(text)
}

export function isFestivalPlace(place) {
  if (!place?.name) return false
  return FESTIVAL_PATTERN.test(place.name)
}

export const GENERIC_NAME_TOKENS = new Set([
  'beach',
  'resort',
  'hotel',
  'island',
  'pulau',
  'coral',
  'cafe',
  'restaurant',
  'restoran',
  'food',
  'travel',
  'malaysia',
  'kopitiam',
  'homestay',
  'chalet',
  'villa',
  'lodge',
  'inn',
  'bar',
  'park',
  'market',
  'centre',
  'center',
  'super',
  'beachfront',
  'seaview',
  'hillview',
  'family',
  'deluxe',
  'superior',
  'suite',
  'room',
  'rooms',
  'front',
  'view',
  'bay',
  'coast',
  'marine',
  'diving',
  'snorkeling',
  'snorkelling',
])

export const LOCATION_ENTITIES = [
  { id: 'redang', pattern: /redang|热浪岛/i },
  { id: 'tenggol', pattern: /tenggol|天鹅岛/i },
  { id: 'tioman', pattern: /tioman|刁曼|paya\s+beach/i },
  { id: 'perhentian', pattern: /perhentian|停泊岛/i },
  { id: 'kapas', pattern: /pulau\s+kapas|kapas\s+island|棉花岛/i },
  { id: 'langkawi', pattern: /langkawi|兰卡威/i },
  { id: 'penang', pattern: /penang|georgetown|槟城/i },
  { id: 'genting', pattern: /genting|云顶/i },
  { id: 'cameron', pattern: /cameron|金马伦/i },
  { id: 'kundasang', pattern: /kundasang|昆达山/i },
  { id: 'kinabalu', pattern: /kinabalu|神山/i },
  { id: 'sipadan', pattern: /sipadan|西巴丹/i },
  { id: 'mataking', pattern: /mataking/i },
  { id: 'kenyir', pattern: /kenyir|tasik\s+kenyir|肯逸/i },
]

const STATE_HINTS = [
  { pattern: /penang|georgetown|槟城/i, state: 'Penang' },
  { pattern: /terengganu|redang|perhentian|tenggol|kenyir|登嘉楼|热浪岛|停泊岛/i, state: 'Terengganu' },
  { pattern: /sabah|kundasang|kinabalu|亚庇|昆达山/i, state: 'Sabah' },
  { pattern: /sarawak|kuching|古晋/i, state: 'Sarawak' },
  { pattern: /melaka|malacca|马六甲/i, state: 'Melaka' },
  { pattern: /pahang|cameron|genting|金马伦|云顶/i, state: 'Pahang' },
  { pattern: /perak|ipoh|怡保/i, state: 'Perak' },
  { pattern: /johor|新山/i, state: 'Johor' },
  { pattern: /selangor|shah alam/i, state: 'Selangor' },
  { pattern: /kuala lumpur|\bkl\b/i, state: 'Kuala Lumpur' },
]

export function normalizeKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function splitTokens(text) {
  return normalizeKey(text).split(/[\s,/|_-]+/).filter(Boolean)
}

export function distinctiveTokens(name) {
  return splitTokens(name).filter((token) => token.length >= 4 && !GENERIC_NAME_TOKENS.has(token))
}

export function detectLocationEntities(text) {
  const haystack = String(text || '')
  return LOCATION_ENTITIES.filter(({ pattern }) => pattern.test(haystack)).map(({ id }) => id)
}

export function entitiesConflict(placeEntities, postEntities) {
  if (!placeEntities.length || !postEntities.length) return false
  const placeSet = new Set(placeEntities)
  return postEntities.some((entity) => !placeSet.has(entity))
}

export function isPromotionalPost(post) {
  if (!post) return true
  const text = [post.title, post.description, post.location, post.sourceKeyword]
    .filter(Boolean)
    .join(' ')
  if (!text.trim()) return true
  if (PROMO_PATTERN.test(text)) return true
  if (RATE_CARD_PATTERN.test(text)) return true
  const priceHits = text.match(/RM\s*\d+/gi) || []
  if (priceHits.length >= 3) return true
  return false
}

export function inferPostState(post) {
  const text = [post.state, post.location, post.sourceKeyword, post.title, post.description]
    .filter(Boolean)
    .join(' ')
  for (const { pattern, state } of STATE_HINTS) {
    if (pattern.test(text)) return state
  }
  return post.state || 'Malaysia'
}

export function postMatchesPlace(post, place) {
  if (!post || !place) return false
  if (isFestivalPost(post) || isFestivalPlace(place)) return false
  if (isPromotionalPost(post)) return false

  const placeState = place.state || 'Malaysia'
  const postState = inferPostState(post)
  if (placeState !== 'Malaysia' && postState !== 'Malaysia' && placeState !== postState) {
    return false
  }

  const text = `${post.title || ''} ${post.description || ''}`
  const textLower = text.toLowerCase()
  const distinctive = distinctiveTokens(place.name)
  const placeEntities = detectLocationEntities(place.name)
  const postEntities = detectLocationEntities(text)

  if (entitiesConflict(placeEntities, postEntities)) {
    return false
  }

  if (distinctive.length > 0) {
    const hits = distinctive.filter((token) => textLower.includes(token))
    if (hits.length > 0) {
      if (placeEntities.length > 0 && postEntities.length === 0) {
        return true
      }
      if (placeEntities.length === 0 || postEntities.length === 0) {
        return true
      }
      return placeEntities.some((entity) => postEntities.includes(entity))
    }
    return false
  }

  if (placeEntities.length > 0) {
    return postEntities.some((entity) => placeEntities.includes(entity))
  }

  return false
}

export function filterPlacePosts(place, posts) {
  return posts.filter((post) => postMatchesPlace(post, place))
}

/** Posts already linked via NLP postIds — keep them unless promo/festival junk. */
export function filterLinkedPlacePosts(place, posts) {
  if (isFestivalPlace(place)) return []
  return posts.filter((post) => !isFestivalPost(post) && !isPromotionalPost(post))
}

export function scorePlacePosts(place, posts) {
  const linked = filterPlacePosts(place, posts)
  const total = posts.length
  const ratio = total > 0 ? linked.length / total : 0
  const placeEntities = detectLocationEntities(place.name)
  const descEntities = detectLocationEntities(place.description || '')
  const flags = []

  if (total > 0 && ratio < 0.6) flags.push('low_post_match_ratio')
  if (placeEntities.length && descEntities.length && entitiesConflict(placeEntities, descEntities)) {
    flags.push('description_location_mismatch')
  }

  const mismatchedPosts = posts.filter((post) => !postMatchesPlace(post, place))
  const promoPosts = posts.filter((post) => isPromotionalPost(post))
  if (promoPosts.length > 0) flags.push('promotional_posts_linked')
  if (mismatchedPosts.length > 0) flags.push('irrelevant_posts_linked')

  const irrelevantSamples = mismatchedPosts.slice(0, 3).map((post) => ({
    id: post.id,
    title: (post.title || '').slice(0, 80),
    entities: detectLocationEntities(`${post.title || ''} ${post.description || ''}`),
  }))

  const confidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (total ? (linked.length / total) * 70 : 50) +
          (flags.includes('description_location_mismatch') ? -25 : 0) +
          (flags.includes('promotional_posts_linked') ? -15 : 0) +
          (distinctiveTokens(place.name).length > 0 ? 15 : 0) +
          (placeEntities.length > 0 ? 10 : 0),
      ),
    ),
  )

  return {
    confidence,
    flags,
    linkedCount: linked.length,
    totalCount: total,
    matchRatio: ratio,
    irrelevantSamples,
  }
}

export function namesShouldNotMerge(nameA, nameB) {
  const entitiesA = detectLocationEntities(nameA)
  const entitiesB = detectLocationEntities(nameB)
  return entitiesConflict(entitiesA, entitiesB) || entitiesConflict(entitiesB, entitiesA)
}

export function namesOverlapForMerge(nameA, nameB) {
  const ka = normalizeKey(nameA)
  const kb = normalizeKey(nameB)
  if (namesShouldNotMerge(nameA, nameB)) return false
  if (ka.includes(kb) || kb.includes(ka)) {
    return Math.min(ka.length, kb.length) >= 10
  }
  const wordsA = new Set(splitTokens(nameA).filter((w) => !GENERIC_NAME_TOKENS.has(w)))
  const wordsB = new Set(splitTokens(nameB).filter((w) => !GENERIC_NAME_TOKENS.has(w)))
  const shared = [...wordsA].filter((word) => wordsB.has(word))
  return shared.length >= 2 && shared.length >= Math.min(wordsA.size, wordsB.size) - 1
}
