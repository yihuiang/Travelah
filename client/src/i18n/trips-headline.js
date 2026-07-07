/** Per-language My Trips hero headline — line breaks and emphasis are locale-specific. */
export const TRIPS_HEADLINES = {
  en: [
    [{ text: 'Your' }],
    [{ text: 'journeys.', em: true }],
  ],
  ms: [
    [{ text: 'Perjalanan' }],
    [{ text: 'anda.', em: true }],
  ],
  'zh-CN': [
    [{ text: '你的' }],
    [{ text: '行程', em: true }],
  ],
}

export function getTripsHeadline(language) {
  return TRIPS_HEADLINES[language] || TRIPS_HEADLINES.en
}
