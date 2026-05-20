import { RANGE_STATE_TOKEN } from '../lib/rangeState'

// Single visual primitive for range_state. Replaces the bare text
// render in SignalCard's grid cell + the divergent legend treatment
// in ExpandedChart. Color comes from RANGE_STATE_TOKEN via a CSS
// variable so the badge stays consistent with AmbientBackground
// (which now also reads from the same token).
//
// size: 'sm' | 'md' (default). sm fits inside the inline PositionBar
// overlay used by II + MOMO rows; md is the default chart legend.
export function RangeStateBadge({ state, size = 'md' }) {
  if (!state) return <span className="range-state-badge state-empty">—</span>
  const token = RANGE_STATE_TOKEN[state]
  if (!token) return <span className="range-state-badge state-empty">{state}</span>
  // state class for any per-state opt-in tweaks (rare); --state-rgb
  // drives bg/border/color via the CSS rule.
  const stateKey = state.replace('/', '-').toLowerCase()
  return (
    <span
      className={`range-state-badge state-${stateKey} size-${size}`}
      style={{ '--state-rgb': token.rgb }}
      title={token.label}
    >
      {state}
    </span>
  )
}
