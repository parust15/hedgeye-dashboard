import { TABS } from '../lib/tabs'

// Cross-tab peek body for TickerDetailModal. Shows what each panel says
// about the focused ticker, with one tile per non-current tab. Click a
// tile to jump to that tab (the App receives the new activeTab via
// onJumpTab and the modal closes).
//
// Tab list comes from src/lib/tabs.js (the single source of truth shared
// with App.jsx). Stage 1 ships with `[—]` placeholders in every tile;
// per-slot data wiring is a follow-up — see Finding #5 for the per-hook
// plan. IMPORTANT: do NOT add new Supabase queries here. The data
// should come from already-fetched hooks lifted to App level when wired.

export function CrossLevelPeek({ ticker, currentTab, onJumpTab }) {
  return (
    <div className="cross-level-peek">
      <p className="cross-level-peek-head">
        <strong>{ticker}</strong> across all panels
      </p>
      <div className="cross-level-peek-grid">
        {TABS.filter((t) => t.id !== currentTab).map((t) => (
          <button
            key={t.id}
            type="button"
            className="peek-tile"
            onClick={() => onJumpTab?.(t.id)}
          >
            <span className="peek-tile-label">{t.label}</span>
            <span className="peek-tile-metric">{t.metric}</span>
            <span className="peek-tile-value peek-tile-value-empty">—</span>
          </button>
        ))}
      </div>
    </div>
  )
}
