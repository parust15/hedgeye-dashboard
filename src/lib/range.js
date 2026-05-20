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

// Where a price sits in a numeric range. Returns a number 0..1
// (un-clamped — values outside the range are still meaningful) or
// null if the row doesn't carry enough data to compute.
//
// The default field names match `hedgeye_signals_v` (buy_trade /
// sell_trade / prev_close). Pass `fields` to point at different
// keys: II + MOMO rows use low_end / top_end / prev_close, for
// example, and the panel can call
// `priceInRangePct(row, { lowKey: 'low_end', highKey: 'top_end' })`
// instead of building a shim row.
//
// We check for nullish BEFORE Number() because Number(null) silently
// coerces to 0 — without the explicit guard, a missing buy_trade
// column from Supabase would be treated as 0 and produce a nonsense
// pct. This is the documented CLAUDE.md footgun.
export function priceInRangePct(row, fields = {}) {
  const lowKey = fields.lowKey ?? 'buy_trade'
  const highKey = fields.highKey ?? 'sell_trade'
  const priceKey = fields.priceKey ?? 'prev_close'
  const lo = row[lowKey]
  const hi = row[highKey]
  const px = row[priceKey]
  if (lo == null || hi == null || px == null) return null
  const loN = Number(lo)
  const hiN = Number(hi)
  const pxN = Number(px)
  if (!Number.isFinite(loN) || !Number.isFinite(hiN) || !Number.isFinite(pxN)) return null
  const span = hiN - loN
  if (span === 0) return null
  return (pxN - loN) / span
}

// Legacy alias for the original buy_trade/sell_trade callers. Kept so
// PositionBar, positionBarFor, effectivePct, and the range.test.js
// suite read identically. New callers should prefer `priceInRangePct`
// for clarity.
export function rangePct(row) {
  return priceInRangePct(row)
}

// Numeric comparator for Array.prototype.sort with nulls-last semantics
// regardless of direction. Extracted from 5+ panel-local copies that
// all had byte-identical bodies (TheCallPanel's `numCmpNullsLast` is
// the same function — renamed for symmetry). Used by every sort
// dropdown that compares a numeric field across rows.
export function numCmp(a, b, dir) {
  const aNull = a == null || !Number.isFinite(a)
  const bNull = b == null || !Number.isFinite(b)
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  return dir === 'asc' ? a - b : b - a
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
