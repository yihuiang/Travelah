export const VIBE_OPTIONS = [
  { id: 'culture', label: 'Culture & Heritage', sub: 'Temples, street art, history', icon: 'museum' },
  { id: 'food', label: 'Food First', sub: 'Hawker stalls, local eats', icon: 'restaurant' },
  { id: 'nature', label: 'Nature & Hiking', sub: 'Trails, parks, waterfalls', icon: 'forest' },
  { id: 'adventure', label: 'Adventure', sub: 'Diving, climbing, rafting', icon: 'surfing' },
  { id: 'relax', label: 'Relax & Unwind', sub: 'Slow days, beaches, wellness', icon: 'spa' },
  { id: 'shopping', label: 'Markets & Shopping', sub: 'Night markets, local crafts', icon: 'storefront' },
]

export const PACE_OPTIONS = [
  { id: 'relaxed', label: 'Relaxed', sub: '3 stops/day', icon: 'coffee' },
  { id: 'balanced', label: 'Balanced', sub: '4–5 stops/day', icon: 'directions_walk' },
  { id: 'full', label: 'Full-on', sub: '6+ stops/day', icon: 'sprint' },
]

export const BUDGET_OPTIONS = [
  { id: 'shoestring', label: 'Shoestring', sub: 'Under RM150/day', icon: 'savings' },
  { id: 'mid', label: 'Mid-range', sub: 'RM150–400/day', icon: 'account_balance_wallet' },
  { id: 'splurge', label: 'Splurge', sub: 'RM400+/day', icon: 'diamond' },
]

export function buildPlanLabels(vibeIds = [], pace = 'balanced', budget = 'mid') {
  const vibeSet = new Set(vibeIds)
  const vibeLabels =
    VIBE_OPTIONS.filter((v) => vibeSet.has(v.id))
      .map((v) => v.label)
      .join(', ') || null
  const paceLabel = PACE_OPTIONS.find((p) => p.id === pace)?.label || null
  const budgetLabel = BUDGET_OPTIONS.find((b) => b.id === budget)?.label || null
  const description = [vibeLabels, paceLabel, budgetLabel].filter(Boolean).join(' · ') || ''
  return { vibeLabels, paceLabel, budgetLabel, description }
}
