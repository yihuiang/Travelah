/** Malaysian state / territory display names — keyed by canonical English value in MongoDB. */
export const STATE_NAME_LOCALES = {
  Perlis: { ms: 'Perlis', 'zh-CN': '玻璃市' },
  Kedah: { ms: 'Kedah', 'zh-CN': '吉打' },
  Penang: { ms: 'Pulau Pinang', 'zh-CN': '槟城' },
  Perak: { ms: 'Perak', 'zh-CN': '霹雳' },
  Selangor: { ms: 'Selangor', 'zh-CN': '雪兰莪' },
  'Negeri Sembilan': { ms: 'Negeri Sembilan', 'zh-CN': '森美兰' },
  Melaka: { ms: 'Melaka', 'zh-CN': '马六甲' },
  Johor: { ms: 'Johor', 'zh-CN': '柔佛' },
  Pahang: { ms: 'Pahang', 'zh-CN': '彭亨' },
  Terengganu: { ms: 'Terengganu', 'zh-CN': '登嘉楼' },
  Kelantan: { ms: 'Kelantan', 'zh-CN': '吉兰丹' },
  Sabah: { ms: 'Sabah', 'zh-CN': '沙巴' },
  Sarawak: { ms: 'Sarawak', 'zh-CN': '砂拉越' },
  'Kuala Lumpur': { ms: 'Kuala Lumpur', 'zh-CN': '吉隆坡' },
  Putrajaya: { ms: 'Putrajaya', 'zh-CN': '布城' },
  Labuan: { ms: 'Labuan', 'zh-CN': '纳闽' },
  Malaysia: { ms: 'Malaysia', 'zh-CN': '马来西亚' },
}

export function lookupStateName(state, language) {
  if (!state || typeof state !== 'string') return state
  if (language === 'en') return state
  const entry = STATE_NAME_LOCALES[state]
  return entry?.[language] ?? state
}
