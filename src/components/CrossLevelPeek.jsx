// Cross-tab peek body for TickerDetailModal. Shows what each panel says
// about the focused ticker, with one tile per non-current tab. Click a
// tile to jump to that tab (the App receives the new activeTab via
// onJumpTab and the modal closes).
//
// Stage 1 ships with `[—]` placeholders in every tile. Per-slot data
// wiring is a follow-up — see Finding #5 for the per-hook plan.
// IMPORTANT: do NOT add new Supabase queries here. The data should
// come from already-fetched hooks lifted to App level when we wire it.

const SLOTS = [
  { id: 'risk-ranges',     label: 'RISK RANGE',   metric: 'TRR/LRR + state' },
  { id: 'the-call',        label: 'THE CALL',     metric: 'position + thesis' },
  { id: 'etf-pro-plus',    label: 'ETF PRO+',     metric: 'direction + rank' },
  { id: 'etf-re-rank',     label: 'RE-RANK',      metric: '1W/1M Δ' },
  { id: 'macro-show',      label: 'MACRO',        metric: 'Quad' },
  { id: 'signal-strength', label: 'SIG STRENGTH', metric: 'tenure' },
  { id: 'investing-ideas', label: 'INV IDEAS',    metric: 'side + POS' },
  { id: 'momo',            label: 'MOMO',         metric: 'trend / trade' },
]

export function CrossLevelPeek({ ticker, currentTab, onJumpTab }) {
  return (
    <div className="cross-level-peek">
      <p className="cross-level-peek-head">
        <strong>{ticker}</strong> across all panels
      </p>
      <div className="cross-level-peek-grid">
        {SLOTS.filter((s) => s.id !== currentTab).map((s) => (
          <button
            key={s.id}
            type="button"
            className="peek-tile"
            onClick={() => onJumpTab?.(s.id)}
          >
            <span className="peek-tile-label">{s.label}</span>
            <span className="peek-tile-metric">{s.metric}</span>
            <span className="peek-tile-value peek-tile-value-empty">—</span>
          </button>
        ))}
      </div>
    </div>
  )
}
