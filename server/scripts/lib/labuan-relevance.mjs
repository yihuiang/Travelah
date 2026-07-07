/**
 * Malaysian Labuan vs crawl noise (Labuan Bajo / Indonesia, other MY states).
 * Crawl keyword "labuan travel" tags many unrelated posts — match on title+description only.
 */

export const LABUAN_BAJO =
  /labuan\s*bajo|纳闽巴霍|komodo|科莫多|粉红沙滩|pink\s*beach|flores|科莫多龙|kukusan\s*island|库库桑岛/i

export const FOREIGN_TRAVEL =
  /曼谷|bangkok|菲律宾|philippines|甲米|krabi|普吉|phuket|成都|chengdu|九寨沟|哈尔滨|泰国(?!湾)|vietnam|bali|巴厘岛|欧洲|europe|indonesia|印尼(?!尼西亚)/i

/** Explicit Malaysian Labuan signals in post content. */
export const MY_LABUAN_CONTENT =
  /纳闽岛|labuan\s*island|联邦直辖区.*纳闽|纳闽.*联邦直辖区|马来西亚.*纳闽|纳闽.*马来西亚|纳闽.*免税|labuan.*duty\s*free|东马.*纳闽|纳闽.*东马|沉船潜水.*纳闽|纳闽.*沉船|labuan.*wreck|labuan.*啤酒|labuan.*巧克力|你听过\s*labuan|labuan.*小岛|探索纳闽|纳闽(?!巴霍)/i

/** Another Malaysian state is the clear topic — exclude from Labuan. */
export const OTHER_STATE_TOPIC = [
  /槟城|penang|george\s*town|小娘惹/i,
  /马六甲|melaka|malacca/i,
  /热浪岛|pulauredang|pulau\s*redang|redang\b/i,
  /砂拉越|sarawak|丰收节/i,
  /武拉必|大山脚|pgmn/i,
  /榴莲/i,
  /雨林|空中走道/i,
]

export function postContent(post) {
  return `${post.title || ''} ${post.description || ''}`.trim()
}

export function isLabuanBajoOrForeign(post) {
  const content = postContent(post)
  if (LABUAN_BAJO.test(content)) return true
  if (FOREIGN_TRAVEL.test(content) && !MY_LABUAN_CONTENT.test(content)) return true
  return false
}

/**
 * True when title/description are about Malaysian Labuan (not crawl keyword alone).
 */
export function isMalaysianLabuanPost(post) {
  const content = postContent(post)
  if (!content) return false
  if (isLabuanBajoOrForeign(post)) return false

  for (const pattern of OTHER_STATE_TOPIC) {
    if (pattern.test(content) && !MY_LABUAN_CONTENT.test(content)) return false
  }

  if (MY_LABUAN_CONTENT.test(content)) return true

  // Standalone "Labuan" / "纳闽" with Malaysia context in the post body
  if (/\blabuan\b/i.test(content) && /马来西亚|malaysia|联邦|东马|免税|duty\s*free/i.test(content)) {
    return true
  }

  return false
}

export function isLabuanWreckPost(post) {
  const content = postContent(post)
  return /沉船|wreck/i.test(content) && isMalaysianLabuanPost(post)
}

export function isLabuanPeaceParkPost(post) {
  const content = postContent(post)
  return /和平公园|peace\s*park/i.test(content) && isMalaysianLabuanPost(post)
}
