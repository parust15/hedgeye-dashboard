import { useTickerSignalState } from '../lib/TickerSignalStateContext'

// Tiny inline indicator showing the unified trend state for a ticker
// (Change 3). Color carries direction, border-style carries source.
//
//   Source           Color       Visual
//   ─────────────────────────────────────────────────────────
//   rr (Risk Range)  bullish     solid green disc
//   rr               bearish     solid red disc
//   call             bullish     hollow green ring (dashed border)
//   call             bearish     hollow red ring (dashed border)
//   stale call-*     either      same as above, ~50% opacity
//
// Renders nothing when:
//   - no ticker provided
//   - the ticker isn't in ticker_signal_state_v yet (provider loading
//     or ticker has no trend recorded — both legitimate empties)
//   - trend_state is missing
//
// IMPORTANT (per spec): bubble is sourced ONLY from
// `ticker_signal_state_v`. Do NOT wire it to
// `hedgeye_call_ticker_summaries.direction` or
// `hedgeye_call_positions.position_type` — those drive the LONG/SHORT
// position chip elsewhere on the row, which stays a distinct concern.
export function TrendBubble({ ticker, title }) {
  const state = useTickerSignalState(ticker)
  if (!state) return null
  const dir = state.trend_state
  if (dir !== 'bullish' && dir !== 'bearish') return null

  const source = state.trend_source === 'call' ? 'call' : 'rr'
  const stale = source === 'call' && state.call_trend_stale === true

  const cls = [
    'trend-bubble',
    `trend-bubble-${dir}`,
    `trend-bubble-${source}`,
    stale ? 'trend-bubble-stale' : null,
  ]
    .filter(Boolean)
    .join(' ')

  // Default title: a humane summary so a hover reveals the underlying
  // source. Callers can override for ticker-specific context.
  const defaultTitle = `${dir.toUpperCase()} trend (source: ${source.toUpperCase()}${
    stale ? ', stale' : ''
  })`
  return <span className={cls} title={title ?? defaultTitle} aria-hidden="true" />
}
