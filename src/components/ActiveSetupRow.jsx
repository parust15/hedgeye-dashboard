import { memo } from 'react'
import { formatPrice } from '../lib/format'
import { BiasTimeframePill } from './BiasTimeframePill'
import { PositionBarWithTooltip } from './PositionBar'
import { PriceCell } from './PriceCell'

// Active Setups row for the II "⚡ Active Setups" subtab (Change 6).
// Sourced from hedgeye_ideas_levels (40 unique tickers across all
// historical messages), narrower than IdeaRow because levels rows
// don't carry sector / thesis / bullets — just the trigger box.
//
// The row consumes a `setupRow` shimmed in the panel to expose:
//   ticker, side, setup ('LONG' | 'SHORT'), trend ('BULLISH' | 'BEARISH'),
//   buy_trade (= low_end), sell_trade (= top_end), prev_close,
//   markerPct (pre-computed by the panel for sort + display)
// plus an optional `display` (live priceDisplay) and an `onFocus` cb
// for cross-tab ticker drill-in.
//
// Click-to-focus, not click-to-expand: there's nothing to expand on a
// levels row, but routing the row click through the same focusTicker
// channel as IdeaRow keeps the UX consistent.
export const ActiveSetupRow = memo(function ActiveSetupRow({
  row,
  display,
  onFocus,
}) {
  const isLong = row.setup === 'LONG'
  const tintClass = isLong ? 'rerank-row-up' : 'rerank-row-down'

  // Setup-type pill: "LONG" / "SHORT" badge separate from the side pill.
  // Color carries direction (green/red); text carries the setup label.
  const setupBias = isLong ? 'BULLISH' : 'BEARISH'

  return (
    <li
      className={`rerank-row tt-ii-setup-row ${tintClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onFocus?.(row.ticker)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onFocus?.(row.ticker)
        }
      }}
    >
      <div className="card-bg" aria-hidden="true" />
      <span className="tt-setup-chip">
        <BiasTimeframePill timeframe="trend" bias={setupBias} size="sm" />
      </span>
      <span className="rerank-ticker">{row.ticker}</span>
      {/* Range bar — visual anchor. Same II-flavored shim as IdeaRow:
          low_end / top_end / prev_close shoved into the buy_trade /
          sell_trade / prev_close slots PositionBar expects. */}
      <span className="tt-ii-range">
        <PositionBarWithTooltip
          row={row}
          display={display}
          markerPct={row.markerPct}
          ghostPct={null}
          zone={null}
        />
      </span>
      <PriceCell prevClose={row.prev_close} display={display} />
      <span className="tt-price tt-price-dim">{formatPrice(row.buy_trade)}</span>
      <span className="tt-price tt-price-dim">{formatPrice(row.sell_trade)}</span>
    </li>
  )
})

export function ActiveSetupRowHead() {
  return (
    <div className="rerank-list-head tt-ii-setup-row" aria-hidden="true">
      <span className="tt-side-head">SETUP</span>
      <span className="rerank-ticker">TICKER</span>
      <span className="tt-range-head">
        <span>LRR</span>
        <span>RANGE</span>
        <span>TRR</span>
      </span>
      <span className="tt-price">Price</span>
      <span className="tt-price">LRR</span>
      <span className="tt-price">TRR</span>
    </div>
  )
}
