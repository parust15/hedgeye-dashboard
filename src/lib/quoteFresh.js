// Header-chip helpers for the II + EPP "live quote freshness" stamp
// (Change 5). Live in /lib (not /components) so PriceCell.jsx can stay
// a pure component file — Vite's react-refresh requires that .jsx
// files export ONLY components for Fast Refresh to work.

// "9:45" — pulled from quoted_at (per spec, NOT updated_at). 24-hour
// to match the priceDisplay.timeLabel format used elsewhere.
export function formatQuoteTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Pick the freshness chip text + label for the panel header. Returns
// null when there's no live data at all (header chip just hides).
//   - any 'live'  → "Quotes · HH:MM ET"
//   - any 'stale' → "Last · HH:MM ET"
//   - market closed (with at least one quote available) → "Close · 4:00 PM"
//
// `latestQuotedAt` is the max(quoted_at) ISO string across the
// live_prices rows that match displayed tickers — computed at the panel
// level from the live_prices Map directly (not from displays, which
// only carry the rendered timeLabel string).
export function quoteChip(displays, latestQuotedAt, isMarketOpen) {
  let anyLive = false
  let anyStale = false
  for (const d of displays.values()) {
    if (!d) continue
    if (d.state === 'live') anyLive = true
    if (d.state === 'stale') anyStale = true
  }
  if (anyLive) {
    return { label: 'Quotes', value: `${formatQuoteTime(latestQuotedAt)} ET` }
  }
  if (anyStale) {
    return { label: 'Last', value: `${formatQuoteTime(latestQuotedAt)} ET` }
  }
  if (!isMarketOpen && displays.size > 0) {
    return { label: 'Close', value: '4:00 PM' }
  }
  return null
}
