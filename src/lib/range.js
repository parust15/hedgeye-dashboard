// Position-in-range math, setup detection, and the thresholds Keith's
// dashboard cares about. All pure — testable without React.

export const NEAR_BUY = 0.20
export const NEAR_SELL = 0.80

// Tighter thresholds applied when a live (or last-close) price is driving
// the marker — gives Keith earlier signal during fast moves.
export const LIVE_NEAR_BUY = 0.05
export const LIVE_NEAR_SELL = 0.95

export const LONG_SETUP_PCT = 0.20
export const SHORT_SETUP_PCT = 0.80

// Where prev_close sits in the [buy_trade, sell_trade] range. Returns a
// number 0..1 (un-clamped — values outside the range are still meaningful)
// or null if the row doesn't carry enough data to compute.
//
// We check for nullish BEFORE Number() because Number(null) silently
// coerces to 0 — without the explicit guard, a missing buy_trade column
// from Supabase would be treated as 0 and produce a nonsense pct.
export function rangePct(row) {
  if (row.buy_trade == null || row.sell_trade == null || row.prev_close == null) return null
  const buy = Number(row.buy_trade)
  const sell = Number(row.sell_trade)
  const close = Number(row.prev_close)
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || !Number.isFinite(close)) return null
  const span = sell - buy
  if (span === 0) return null
  return (close - buy) / span
}

// Resolve the pct used by zone/setup logic: live if available, else prev-close.
export function effectivePct(row, display) {
  if (display && display.livePct != null) return display.livePct
  return rangePct(row)
}

// Whether the live-price thresholds should apply for this card. Both 'live'
// and 'closed' states qualify because the close price still reflects today.
export function hasLivePrice(display) {
  if (!display) return false
  if (display.state !== 'live' && display.state !== 'closed') return false
  return display.livePct != null
}

// Whether this row meets Keith's LONG / SHORT setup confluence. Live pct
// takes precedence when available, otherwise prev-close pct.
export function getSetup(row, display) {
  const pct = effectivePct(row, display)
  if (pct == null) return null
  if (row.trend === 'BULLISH' && pct < LONG_SETUP_PCT) return 'LONG'
  if (row.trend === 'BEARISH' && pct > SHORT_SETUP_PCT) return 'SHORT'
  return null
}

// Position-bar geometry for one card: primary marker, optional prev_close
// ghost, and the near-buy/near-sell zone classification.
// When live/closed price is available, the live pct drives the marker and
// uses tight LIVE_NEAR_* thresholds. Otherwise we fall back to prev-close
// pct with the wider NEAR_* thresholds and no ghost.
export function positionBarFor(row, display) {
  const prevPct = rangePct(row)
  const useLive = hasLivePrice(display)
  const markerPct = useLive ? display.livePct : prevPct
  const ghostPct = useLive ? prevPct : null

  let zone = 'mid'
  let zoneLabel = null
  if (markerPct != null) {
    const lo = useLive ? LIVE_NEAR_BUY : NEAR_BUY
    const hi = useLive ? LIVE_NEAR_SELL : NEAR_SELL
    if (markerPct < lo) {
      zone = 'near-buy'
      zoneLabel = 'Near buy'
    } else if (markerPct > hi) {
      zone = 'near-sell'
      zoneLabel = 'Near sell'
    }
  }
  return { markerPct, ghostPct, zone, zoneLabel }
}
