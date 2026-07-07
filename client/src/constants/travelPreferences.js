export const PACE_OPTIONS = ['Relaxed', 'Balanced', 'Full-on']

export const FOCUS_OPTIONS = ['Heritage', 'Nature', 'Food', 'Adventure', 'Markets']

export const DINING_OPTIONS = ['Culinary Arts', 'Local Street Food']

export const BUDGET_OPTIONS = ['Shoestring', 'Mid-range', 'Splurge']

export const DEFAULT_PREFERENCES = {
  pace: [],
  focus: [],
  dining: [],
  budget: [],
}

/** Normalize legacy string values from older accounts */
export function normalizePreferenceList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function normalizePreferences(preferences) {
  return {
    pace: normalizePreferenceList(preferences?.pace),
    focus: normalizePreferenceList(preferences?.focus),
    dining: normalizePreferenceList(preferences?.dining),
    budget: normalizePreferenceList(preferences?.budget),
  }
}
