// Shared palette + range_state → fill mapping for the 10-day chart.
// One source of truth keeps line colors, axis chrome, tooltip styling,
// and the per-day ReferenceArea fills consistent.
//
// Chart treatment is intentionally 2-color + hash (NOT the 4-color
// canonical range_state palette used by RangeStateBadge / ambient
// backdrop). Rationale: on a small ticker chart, two strongly
// readable bull/bear fills + a hashed "non-directional" pattern read
// faster than four distinct hues. Per user spec for the per-ticker
// chart only — the badge surfaces elsewhere still use the canonical
// 4-color token.

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

// Per-state ReferenceArea fill.
// - HH/HL (bullish)  → solid green
// - LH/LL (bearish)  → solid red
// - LH/HL (compression, non-directional) → green-tinted hash
// - HH/LL (expansion, non-directional)   → red-tinted hash
// - unchanged → faint gray solid
// Pattern ids referenced below are declared in <defs> inside
// ExpandedChart.jsx.
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
