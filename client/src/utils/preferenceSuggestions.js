import { normalizePreferences } from '../constants/travelPreferences.js'

const FOCUS_TO_VIBES = {
  Heritage: { history: true, museum: true },
  Nature: { nature: true },
  Food: { foodie: true },
  Adventure: { nature: true, popular: true },
  Markets: { shopping: true, popular: true },
  Urban: { shopping: true, popular: true },
  'Beach & Islands': { nature: true, popular: true },
}

const DINING_TO_VIBES = {
  'Culinary Arts': { foodie: true },
  'Local Street Food': { foodie: true },
  'Fine Dining': { foodie: true },
  Casual: { foodie: true },
}

const RELAXED_PACE = new Set(['Relaxed', 'Leisurely'])
const ACTIVE_PACE = new Set(['Full-on', 'Active'])

export function isIdentityComplete(preferences) {
  const { pace, focus, dining, budget } = normalizePreferences(preferences)
  return pace.length > 0 && focus.length > 0 && dining.length > 0 && budget.length > 0
}

export function needsOnboarding(user) {
  return Boolean(user && !isIdentityComplete(user.preferences))
}

function mergeVibesFromSelections(selections, map) {
  return selections.reduce((acc, key) => ({ ...acc, ...map[key] }), {})
}

export function getSuggestionsFromPreferences(preferences) {
  const { pace, focus, dining } = normalizePreferences(preferences)

  if (!isIdentityComplete(preferences)) {
    return {
      summary: null,
      suggestedVibes: {},
      planTip: null,
    }
  }

  const suggestedVibes = {
    ...mergeVibesFromSelections(focus, FOCUS_TO_VIBES),
    ...mergeVibesFromSelections(dining, DINING_TO_VIBES),
  }

  const paceLabels = pace.join(', ').toLowerCase()
  const focusLabels = focus.join(', ').toLowerCase()
  const diningLabels = dining.join(', ').toLowerCase()

  let paceTip = 'Balance iconic highlights with downtime.'
  const hasRelaxed = pace.some((p) => RELAXED_PACE.has(p))
  const hasActive = pace.some((p) => ACTIVE_PACE.has(p))
  if (hasRelaxed && !hasActive) {
    paceTip = 'Allow extra time between stops for a relaxed rhythm.'
  } else if (hasActive && !hasRelaxed) {
    paceTip = 'Pack more sights into each day.'
  }

  const summary = `Tailored for ${paceLabels} travel, ${focusLabels}, and ${diningLabels}.`
  const planTip = `${summary} ${paceTip}`

  return { summary, suggestedVibes, planTip }
}

export function formatPreferencesForDisplay(preferences) {
  const normalized = normalizePreferences(preferences)
  return {
    pace: normalized.pace.length ? normalized.pace.join(', ') : '—',
    focus: normalized.focus.length ? normalized.focus.join(', ') : '—',
    dining: normalized.dining.length ? normalized.dining.join(', ') : '—',
    budget: normalized.budget.length ? normalized.budget.join(', ') : '—',
  }
}
