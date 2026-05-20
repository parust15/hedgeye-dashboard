// Shared palette + range_state → fill mapping for the 10-day chart.
// One source of truth keeps line colors, axis chrome, tooltip styling,
// and the per-day ReferenceArea fills consistent.
//
// Range fills are derived from RANGE_STATE_TOKEN — the canonical
// range_state spec. Previously this file had literal rgba strings
// that drifted from the AmbientBackground's local STATE_TINTS and
// the ExpandedChart legend's hand-built tokens (HH/LL "expansion"
// was rendered using the bear palette, LH/HL "compression" using
// the bull palette — visible color drift the sync spec calls out).

import { RANGE_STATE_TOKEN } from './rangeState'

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

// Build a token-rgba helper so each ReferenceArea fill uses the same
// RGB the badge / ambient backdrop / chart legend pull from.
function tokenRgba(state, alpha) {
  const rgb = RANGE_STATE_TOKEN[state]?.rgb ?? RANGE_STATE_TOKEN.unchanged.rgb
  return `rgba(${rgb}, ${alpha})`
}

// Per-state ReferenceArea fill. HH/HL (bullish) + LH/LL (bearish)
// render as solid tinted areas. HH/LL (expansion) and LH/HL
// (compression) ALSO use solid colors — derived from the canonical
// amber + blue tokens — so the chart no longer relies on the
// inverted-color pattern defs that shipped originally. The pattern
// defs in ExpandedChart.jsx still exist for any future caller that
// wants the striped look; their stroke colors were corrected in the
// same pass.
export const RANGE_FILL = {
  'HH/HL':     tokenRgba('HH/HL', 0.28),
  'LH/LL':     tokenRgba('LH/LL', 0.28),
  'HH/LL':     tokenRgba('HH/LL', 0.22),
  'LH/HL':     tokenRgba('LH/HL', 0.22),
  'unchanged': tokenRgba('unchanged', 0.12),
}

export function rangeFill(state) {
  if (state in RANGE_FILL) return RANGE_FILL[state]
  return RANGE_FILL.unchanged
}
