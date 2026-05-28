// Canonical tab list — one source of truth for tab ids, display order,
// and the per-tab labels the cross-tab peek surfaces. Replaces two
// independent constants (App.jsx's VALID_TABS + CrossLevelPeek's local
// SLOTS) that drifted as new tabs landed.
//
// Order here is the on-screen tab order. Adding a new tab means one
// edit to this file + (typically) a new panel render branch in App.jsx.
export const TABS = [
  { id: 'daily-brief',     label: 'DAILY BRIEF',  metric: 'macro regime + roadmap' },
  { id: 'risk-ranges',     label: 'RISK RANGE',   metric: 'TRR/LRR + state' },
  { id: 'the-call',        label: 'THE CALL',     metric: 'position + thesis' },
  { id: 'etf-pro-plus',    label: 'ETF PRO+',     metric: 'direction + rank' },
  { id: 'etf-re-rank',     label: 'RE-RANK',      metric: '1W/1M Δ' },
  { id: 'macro-show',      label: 'MACRO',        metric: 'Quad' },
  { id: 'signal-strength', label: 'SIG STRENGTH', metric: 'tenure' },
  { id: 'investing-ideas', label: 'INV IDEAS',    metric: 'side + POS' },
  { id: 'momo',            label: 'MOMO',         metric: 'trend / trade' },
]

// Convenience exports — derived once, not at every call site.
export const TAB_IDS = TABS.map((t) => t.id)
export const TAB_ID_SET = new Set(TAB_IDS)
