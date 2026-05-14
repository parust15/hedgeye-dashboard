// Shared palette + range_state → fill mapping for the 10-day chart.
// One source of truth keeps line colors, axis chrome, tooltip styling,
// and the per-day ReferenceArea fills consistent.

export const CHART_COLORS = {
  axis: '#262b38',
  axisTick: '#8b93a6',
  grid: 'rgba(255,255,255,0.06)',
  tooltipBg: '#14171f',
  tooltipBorder: '#364056',
  textStrong: '#f3f5fa',
  sell: '#ef4444',
  buy: '#22c55e',
}

// SVG pattern ids defined inside <defs> of the chart. fillFor returns
// either a solid rgba or a url(#pattern-id) reference.
export const RANGE_FILL = {
  'HH/HL': 'rgba(34, 197, 94, 0.28)',
  'LH/LL': 'rgba(239, 68, 68, 0.28)',
  'LH/HL': 'url(#pattern-lhhl)',
  'HH/LL': 'url(#pattern-hhll)',
  unchanged: 'rgba(156, 163, 175, 0.12)',
}

export function rangeFill(state) {
  if (state in RANGE_FILL) return RANGE_FILL[state]
  return RANGE_FILL.unchanged
}
