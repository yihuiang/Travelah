/** Per-language hero headline — line breaks and emphasis are locale-specific. */
export const HERO_HEADLINES = {
  en: [
    [{ text: 'The world' }],
    [{ text: 'is ' }, { text: 'more', em: true }],
    [{ text: 'beautiful', em: true }],
    [{ text: 'local.' }],
  ],
  ms: [
    [{ text: 'Dunia ini' }],
    [{ text: 'lebih ', em: false }, { text: 'indah', em: true }],
    [{ text: 'secara ', em: false }, { text: 'tempatan.', em: true }],
  ],
  'zh-CN': [
    [{ text: '世界' }],
    [{ text: '因', em: false }, { text: '在地', em: true }],
    [{ text: '而', em: false }, { text: '更美丽', em: true }],
  ],
}

export function getHeroHeadline(language) {
  return HERO_HEADLINES[language] || HERO_HEADLINES.en
}
