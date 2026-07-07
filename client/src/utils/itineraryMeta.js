export function formatPlanDates(start, end) {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null
  const shortFmt = (d) => d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
  const nights = Math.round((e - s) / 86400000)
  return {
    range: `${shortFmt(s)}–${shortFmt(e)} ${s.getFullYear()}`,
    nights,
    dayCount: nights + 1,
  }
}

export function mergePlanMeta(base, plan) {
  const dest = plan.destination?.trim() || base.destination
  const dates = formatPlanDates(plan.startDate, plan.endDate)

  if (dates) {
    base.dateRange = dates.range
    base.nights = dates.nights
    base.dayCount = dates.dayCount
  }

  if (plan.vibeLabels && plan.vibeLabels !== '—') {
    base.vibe = plan.vibeLabels.split(',')[0].trim()
  }
  if (plan.paceLabel && plan.paceLabel !== '—') {
    base.pace = `${plan.paceLabel} pace`
  } else if (base.pace && !base.pace.includes('pace')) {
    base.pace = `${base.pace} pace`
  }
  if (plan.budgetLabel && plan.budgetLabel !== '—') {
    base.budget = plan.budgetLabel
  }

  base.destination = dest
  return base
}
