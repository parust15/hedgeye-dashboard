// Canonical range_state spec — single source of truth for color + label.
// Replaces the divergent treatments in AmbientBackground (local
// STATE_TINTS object), chartTheme (literal rgba strings), and
// ExpandedChart legend (hand-built color tokens).
//
// HH/HL = both high (higher-high + higher-low)   → bullish, green
// LH/LL = both low (lower-high + lower-low)      → bearish, red
// HH/LL = expansion (range widening, both ends)  → amber
// LH/HL = compression (range tightening)         → blue
// unchanged = no data for prior bar              → neutral grey
export const RANGE_STATES = ['HH/HL', 'LH/LL', 'HH/LL', 'LH/HL', 'unchanged']

export const RANGE_STATE_TOKEN = {
  'HH/HL':     { rgb: '34, 197, 94',   cssVar: '--bull',         label: 'bullish' },
  'LH/LL':     { rgb: '239, 68, 68',   cssVar: '--bear',         label: 'bearish' },
  'HH/LL':     { rgb: '245, 158, 11',  cssVar: '--amber-strong', label: 'expansion' },
  'LH/HL':     { rgb: '96, 165, 250',  cssVar: '--accent',       label: 'compression' },
  'unchanged': { rgb: '156, 163, 175', cssVar: '--neutral',      label: 'unchanged' },
}

// For AmbientBackground compatibility — it consumes {r,g,b} objects
// and weight-averages them across the rendered ticker set.
export const STATE_TINTS = Object.fromEntries(
  Object.entries(RANGE_STATE_TOKEN).map(([k, v]) => {
    const [r, g, b] = v.rgb.split(',').map((s) => Number(s.trim()))
    return [k, { r, g, b }]
  })
)
